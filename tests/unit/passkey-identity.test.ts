import { afterEach, describe, expect, it } from "vitest"

import { requireMutationIdentity } from "@/app/api/community/context"
import { createIdentitySessionResponse } from "@/lib/identity/csrf"
import { PasskeyChallengeStore } from "@/lib/identity/passkey"

const identityId = "rider-12345678901234567890"
const secret = "s".repeat(32)
const originalSecret = process.env.SWITCHBACK_SESSION_SECRET

afterEach(() => {
  process.env.SWITCHBACK_SESSION_SECRET = originalSecret
})

function cookies(response: Response): { session: string; csrf: string } {
  const value = response.headers.get("set-cookie") ?? ""
  const session = value.match(/switchback_session=([^;]+)/)?.[1]
  const csrf = value.match(/switchback_csrf=([^;]+)/)?.[1]
  if (!session || !csrf) throw new Error("identity cookies were not set")
  return { session, csrf }
}

describe("passkey identity ceremony boundary", () => {
  it("binds one-time challenges to their ceremony kind", () => {
    const challenges = new PasskeyChallengeStore(100, 2)
    const registration = challenges.issue("registration", identityId, 1_000)

    expect(challenges.consume(registration.id, "authentication", 1_050)).toBeNull()
    expect(challenges.consume(registration.id, "registration", 1_050)?.challenge).toBe(registration.challenge)
    expect(challenges.consume(registration.id, "registration", 1_050)).toBeNull()

    const expired = challenges.issue("authentication", null, 1_000)
    expect(challenges.consume(expired.id, "authentication", 1_101)).toBeNull()
  })

  it("bounds outstanding challenges", () => {
    const challenges = new PasskeyChallengeStore(100, 1)
    challenges.issue("authentication", null, 1_000)

    expect(() => challenges.issue("authentication", null, 1_001)).toThrow(/too many/i)
  })

  it("sets secure session and CSRF cookies after identity verification", () => {
    process.env.SWITCHBACK_SESSION_SECRET = secret

    const response = createIdentitySessionResponse(identityId)
    const setCookie = response.headers.get("set-cookie") ?? ""

    expect(setCookie).toMatch(/switchback_session=/)
    expect(setCookie).toMatch(/switchback_session=[^;]+; HttpOnly; Secure; SameSite=Lax; Path=\//)
    expect(setCookie).toMatch(/switchback_csrf=[^;]+; Secure; SameSite=Lax; Path=\//)
  })

  it("requires CSRF for cookie-authenticated mutations but accepts bearer sessions", () => {
    process.env.SWITCHBACK_SESSION_SECRET = secret
    const identityResponse = createIdentitySessionResponse(identityId)
    const { session, csrf } = cookies(identityResponse)

    const cookieRequest = (header?: string) => new Request("https://switchback.test/api/community/routes", {
      method: "POST",
      headers: {
        cookie: `switchback_session=${session}; switchback_csrf=${csrf}`,
        ...(header ? { "x-switchback-csrf": header } : {})
      }
    })

    expect(() => requireMutationIdentity(cookieRequest())).toThrow("CSRF_REQUIRED")
    expect(() => requireMutationIdentity(cookieRequest("wrong"))).toThrow("CSRF_REQUIRED")
    expect(requireMutationIdentity(cookieRequest(csrf))).toBe(identityId)

    const bearer = new Request("https://switchback.test/api/community/routes", {
      method: "POST",
      headers: { authorization: `Bearer ${session}` }
    })
    expect(requireMutationIdentity(bearer)).toBe(identityId)
  })
})
