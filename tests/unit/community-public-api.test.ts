import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { handleCommunityRouteDelete, handleCommunityRouteGet } from "@/app/api/community/routes/[routeId]/route"
import { handleCommunityRouteGpxGet } from "@/app/api/community/routes/[routeId]/gpx/route"
import { handleCommunityReportsGet } from "@/app/api/community/reports/route"
import { handleCommunityReportPatch } from "@/app/api/community/reports/[reportId]/route"
import { CommunityRepository } from "@/lib/community/repository"
import { createIdentitySession } from "@/lib/identity/passkey"

const secret = "s".repeat(32)
const resources: Array<{ repository: CommunityRepository; directory: string }> = []

afterEach(() => {
  delete process.env.SWITCHBACK_SESSION_SECRET
  delete process.env.SWITCHBACK_COMMUNITY_OPERATOR_IDS
  for (const resource of resources.splice(0)) {
    resource.repository.close()
    rmSync(resource.directory, { recursive: true, force: true })
  }
})

function createRoute(): { repository: CommunityRepository; routeId: string; identityId: string } {
  const directory = mkdtempSync(path.join(tmpdir(), "switchback-community-public-api-"))
  const repository = new CommunityRepository(path.join(directory, "community.sqlite"))
  resources.push({ repository, directory })
  const identityId = repository.createIdentity("Rider")
  const { routeId } = repository.createRoute(identityId, {
    title: "Public preview",
    description: "Sanitized route",
    routeFingerprint: "private-route-fingerprint",
    stats: { distanceMiles: 9 },
    provenanceClass: "built-and-verified",
    visibility: "public",
    preview: {
      geometry: [
        [[-76.9, 40.2], [-76.8, 40.3]],
        [[-76.7, 40.4], [-76.6, 40.5]]
      ],
      distanceMiles: 2,
      durationMinutes: 12,
      exactPreviewRequired: true
    }
  })
  return { repository, routeId, identityId }
}

function credentials(identityId: string): string {
  const session = createIdentitySession(identityId, secret)
  return `switchback_session=${session}; switchback_csrf=csrf-token`
}

describe("public community route API", () => {
  it("returns only the stored sanitized preview and preserves separated GPX segments", async () => {
    process.env.SWITCHBACK_SESSION_SECRET = secret
    const { repository, routeId } = createRoute()
    const context = { params: Promise.resolve({ routeId }) }

    const detail = await handleCommunityRouteGet(new Request(`https://switchback.test/api/community/routes/${routeId}`), context, repository)
    expect(detail.status).toBe(200)
    expect(detail.headers.get("cache-control")).toMatch(/public/)
    expect(await detail.json()).toMatchObject({ route: { preview: { geometry: expect.arrayContaining([expect.any(Array)]) } } })

    const gpx = await handleCommunityRouteGpxGet(new Request(`https://switchback.test/api/community/routes/${routeId}/gpx`), context, repository)
    expect(gpx.status).toBe(200)
    expect(gpx.headers.get("content-disposition")).toMatch(/\.gpx/)
    const body = await gpx.text()
    expect(body.match(/<trkseg>/g)).toHaveLength(2)
    expect(body).not.toContain("private-route-fingerprint")
  })

  it("requires the authenticated mutation boundary to unpublish", async () => {
    process.env.SWITCHBACK_SESSION_SECRET = secret
    const { repository, routeId, identityId } = createRoute()
    const context = { params: Promise.resolve({ routeId }) }
    const unauthorized = await handleCommunityRouteDelete(new Request("https://switchback.test", { method: "DELETE" }), context, repository)
    expect(unauthorized.status).toBe(401)

    const response = await handleCommunityRouteDelete(new Request("https://switchback.test", {
      method: "DELETE",
      headers: { cookie: credentials(identityId), "x-switchback-csrf": "csrf-token" }
    }), context, repository)
    expect(response.status).toBe(200)
    expect(repository.getRoute(routeId)).toBeNull()
  })

  it("keeps report review and route hide/restore behind the operator allowlist", async () => {
    process.env.SWITCHBACK_SESSION_SECRET = secret
    const { repository, routeId, identityId } = createRoute()
    process.env.SWITCHBACK_COMMUNITY_OPERATOR_IDS = identityId
    const reportId = repository.report(identityId, "route", routeId, "Private driveway")
    const cookie = credentials(identityId)
    const reports = await handleCommunityReportsGet(new Request("https://switchback.test/api/community/reports", { headers: { cookie } }), repository)
    expect(reports.status).toBe(200)
    expect((await reports.json()).reports).toMatchObject([{ id: reportId, status: "open" }])

    const response = await handleCommunityReportPatch(new Request("https://switchback.test", {
      method: "PATCH",
      headers: { cookie, "x-switchback-csrf": "csrf-token", "content-type": "application/json" },
      body: JSON.stringify({ status: "reviewed", routeAction: "hide" })
    }), { params: Promise.resolve({ reportId }) }, repository)
    expect(response.status).toBe(200)
    expect(repository.getRoute(routeId)).toBeNull()

    const restore = await handleCommunityReportPatch(new Request("https://switchback.test", {
      method: "PATCH",
      headers: { cookie, "x-switchback-csrf": "csrf-token", "content-type": "application/json" },
      body: JSON.stringify({ status: "reviewed", routeAction: "restore" })
    }), { params: Promise.resolve({ reportId }) }, repository)
    expect(restore.status).toBe(200)
    expect(repository.getRoute(routeId)?.title).toBe("Public preview")
  })
})
