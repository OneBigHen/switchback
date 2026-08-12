import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { handleCommunityRoutesPost } from "@/app/api/community/routes/route"
import { CommunityRepository } from "@/lib/community/repository"
import { createIdentitySessionResponse } from "@/lib/identity/csrf"

const originalSecret = process.env.SWITCHBACK_SESSION_SECRET
const resources: Array<{ repository: CommunityRepository; directory: string }> = []

afterEach(() => {
  process.env.SWITCHBACK_SESSION_SECRET = originalSecret
  for (const resource of resources.splice(0)) {
    resource.repository.close()
    rmSync(resource.directory, { recursive: true, force: true })
  }
})

function session(identityId: string): { value: string; csrf: string } {
  const response = createIdentitySessionResponse(identityId)
  const setCookie = response.headers.get("set-cookie") ?? ""
  const value = setCookie.match(/switchback_session=([^;]+)/)?.[1]
  const csrf = setCookie.match(/switchback_csrf=([^;]+)/)?.[1]
  if (!value || !csrf) throw new Error("session cookies missing")
  return { value, csrf }
}

function routeBody(): string {
  return JSON.stringify({
    title: "River loop",
    description: "A public ride",
    routeFingerprint: "fingerprint-csrf-1",
    stats: { distanceMiles: 42 },
    provenanceClass: "rider-recorded",
    visibility: "public",
    preview: {
      geometry: [[[ -76.9, 40.2 ], [ -76.7, 40.4 ]]],
      distanceMiles: 25,
      durationMinutes: 40,
      exactPreviewRequired: true
    }
  })
}

describe("cookie-authenticated mutation CSRF", () => {
  it("rejects a cookie mutation without a matching CSRF header", async () => {
    process.env.SWITCHBACK_SESSION_SECRET = "s".repeat(32)
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-csrf-"))
    const repository = new CommunityRepository(path.join(directory, "community.sqlite"))
    resources.push({ repository, directory })
    const identityId = repository.createIdentity("Rider")
    const credentials = session(identityId)

    const response = await handleCommunityRoutesPost(new Request("http://localhost:3000/api/community/routes", {
      method: "POST",
      headers: { cookie: `switchback_session=${credentials.value}; switchback_csrf=${credentials.csrf}` },
      body: routeBody()
    }), repository)

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "CSRF_REQUIRED" } })
  })

  it("accepts a matching cookie CSRF token and preserves bearer compatibility", async () => {
    process.env.SWITCHBACK_SESSION_SECRET = "s".repeat(32)
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-csrf-"))
    const repository = new CommunityRepository(path.join(directory, "community.sqlite"))
    resources.push({ repository, directory })
    const identityId = repository.createIdentity("Rider")
    const credentials = session(identityId)

    const cookieResponse = await handleCommunityRoutesPost(new Request("http://localhost:3000/api/community/routes", {
      method: "POST",
      headers: {
        cookie: `switchback_session=${credentials.value}; switchback_csrf=${credentials.csrf}`,
        "x-switchback-csrf": credentials.csrf
      },
      body: routeBody()
    }), repository)
    expect(cookieResponse.status).toBe(201)

    const bearerResponse = await handleCommunityRoutesPost(new Request("http://localhost:3000/api/community/routes", {
      method: "POST",
      headers: { authorization: `Bearer ${credentials.value}` },
      body: routeBody().replace("fingerprint-csrf-1", "fingerprint-csrf-2")
    }), repository)
    expect(bearerResponse.status).toBe(201)
  })
})
