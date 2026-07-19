import { afterEach, describe, expect, it, vi } from "vitest"
import { handleSpotifyToken } from "@/app/api/spotify/token/handler"
import { SPOTIFY_SCOPES } from "@/lib/spotify/constants"
import {
  SPOTIFY_SESSION_COOKIE,
  openSpotifyCookie,
  sealSpotifyCookie,
  type SpotifyServerConfig,
  type SpotifySession
} from "@/lib/spotify/server/session"

const config: SpotifyServerConfig = {
  clientId: "public-client-id",
  redirectUri: "https://ride.example.test/callback",
  sessionSecret: "a-test-session-secret-that-is-at-least-thirty-two-characters",
  secureCookies: true
}

function requestWith(cookie: string): Request {
  return new Request("https://ride.example.test/api/spotify/token", {
    headers: { cookie: `${SPOTIFY_SESSION_COOKIE}=${cookie}` }
  })
}

function requestWithHandoff(handoff: string): Request {
  return new Request("https://ride.example.test/api/spotify/token", {
    headers: { "x-switchback-spotify-handoff": handoff }
  })
}

function cookieValue(response: Response, name: string): string | null {
  const header = response.headers.get("set-cookie") ?? ""
  const match = header.match(new RegExp(`(?:^|,\\s*)${name}=([^;]*)`))
  return match?.[1] ?? null
}

function session(now: number, expiresAt: number, sessionId = "spotify-test-session"): SpotifySession {
  return {
    sessionId,
    accessToken: "old-access-token",
    refreshToken: "durable-refresh-token",
    expiresAt,
    refreshExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    scopes: SPOTIFY_SCOPES
  }
}

describe("Spotify access token endpoint", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("requires every SDK and playback scope before exposing an access token", async () => {
    const now = Date.parse("2026-07-15T12:00:00Z")
    const incomplete = { ...session(now, now + 5 * 60_000), scopes: ["streaming"] }
    const cookie = await sealSpotifyCookie(incomplete, config.sessionSecret, "session")

    const response = await handleSpotifyToken(requestWith(cookie), { config, fetcher: vi.fn(), now: () => now })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "SPOTIFY_SCOPES_MISSING" } })
  })

  it("returns a still-valid access token without exposing the refresh token", async () => {
    const now = Date.parse("2026-07-15T12:00:00Z")
    const cookie = await sealSpotifyCookie(session(now, now + 5 * 60_000), config.sessionSecret, "session")
    const fetcher = vi.fn()
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)

    const response = await handleSpotifyToken(requestWith(cookie), { config, fetcher, now: () => now })

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(response.headers.get("vary")).toContain("Cookie")
    expect(await response.json()).toEqual({
      accessToken: "old-access-token",
      expiresAt: now + 5 * 60_000
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith("[spotify] browser token delivered", {
      outcome: "issued",
      refreshed: false
    })
  })

  it("claims a one-time callback handoff on the first-party token request and establishes the session cookie", async () => {
    const now = Date.parse("2026-07-16T17:30:00Z")
    const handoffResolver = vi.fn(async () => session(now, now + 5 * 60_000, "callback-handoff-session"))

    const response = await handleSpotifyToken(requestWithHandoff("one-time-player-handoff"), {
      config,
      fetcher: vi.fn(),
      now: () => now,
      handoffResolver
    } as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      accessToken: "old-access-token",
      expiresAt: now + 5 * 60_000
    })
    expect(handoffResolver).toHaveBeenCalledWith("one-time-player-handoff")
    expect(response.headers.get("set-cookie")).toContain(`${SPOTIFY_SESSION_COOKIE}=`)
  })

  it("silently refreshes an expiring access token and retains an unrotated refresh token", async () => {
    const now = Date.parse("2026-07-15T12:00:00Z")
    const original = session(now, now + 20_000, "unrotated-refresh-session")
    const cookie = await sealSpotifyCookie(original, config.sessionSecret, "session")
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      const body = new URLSearchParams(init?.body as string)
      expect(body.get("grant_type")).toBe("refresh_token")
      expect(body.get("refresh_token")).toBe(original.refreshToken)
      expect(body.get("client_id")).toBe(config.clientId)
      expect(body.has("client_secret")).toBe(false)
      expect(new Headers(init?.headers).get("authorization")).toBeNull()
      return Response.json({
        access_token: "refreshed-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        scope: SPOTIFY_SCOPES.join(" ")
      })
    })

    const response = await handleSpotifyToken(requestWith(cookie), { config, fetcher, now: () => now })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      accessToken: "refreshed-access-token",
      expiresAt: now + 3_600_000
    })
    const refreshed = await openSpotifyCookie<SpotifySession>(
      cookieValue(response, SPOTIFY_SESSION_COOKIE)!,
      config.sessionSecret,
      "session"
    )
    expect(refreshed.refreshToken).toBe(original.refreshToken)
    expect(refreshed.refreshExpiresAt).toBe(original.refreshExpiresAt)
  })

  it("clears an expired or revoked refresh session and requests reauthorization", async () => {
    const now = Date.parse("2026-07-15T12:00:00Z")
    const cookie = await sealSpotifyCookie(session(now, now - 1), config.sessionSecret, "session")
    const fetcher = vi.fn(async () => Response.json(
      { error: "invalid_grant", error_description: "Refresh token revoked" },
      { status: 400 }
    ))

    const response = await handleSpotifyToken(requestWith(cookie), { config, fetcher, now: () => now })

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: "SPOTIFY_REAUTH_REQUIRED" } })
    expect(response.headers.get("set-cookie")).toContain(`${SPOTIFY_SESSION_COOKIE}=;`)
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0")
  })

  it("coalesces concurrent refreshes so rotated tokens cannot invalidate another tab", async () => {
    const now = Date.parse("2026-07-15T12:00:00Z")
    const original = session(now, now + 20_000, "concurrent-refresh-session")
    const cookie = await sealSpotifyCookie(original, config.sessionSecret, "session")
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return Response.json({
        access_token: "shared-access-token",
        refresh_token: "rotated-refresh-token",
        token_type: "Bearer",
        expires_in: 3600,
        scope: SPOTIFY_SCOPES.join(" ")
      })
    })

    const [first, second] = await Promise.all([
      handleSpotifyToken(requestWith(cookie), { config, fetcher, now: () => now }),
      handleSpotifyToken(requestWith(cookie), { config, fetcher, now: () => now })
    ])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(1)
    for (const response of [first, second]) {
      const refreshed = await openSpotifyCookie<SpotifySession>(
        cookieValue(response, SPOTIFY_SESSION_COOKIE)!,
        config.sessionSecret,
        "session"
      )
      expect(refreshed.refreshToken).toBe("rotated-refresh-token")
    }
  })
})
