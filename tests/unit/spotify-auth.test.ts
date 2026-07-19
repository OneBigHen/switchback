import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { handleSpotifyCallback } from "@/app/callback/handler"
import { handleSpotifyLogin } from "@/app/api/spotify/login/handler"
import { handleSpotifyToken } from "@/app/api/spotify/token/handler"
import { SPOTIFY_SCOPES } from "@/lib/spotify/constants"
import { createPkcePair } from "@/lib/spotify/oauth"
import { SPOTIFY_HANDOFF_HEADER } from "@/lib/spotify/server/handoff"
import {
  SPOTIFY_OAUTH_COOKIE,
  SPOTIFY_SESSION_COOKIE,
  openSpotifyCookie,
  readSpotifyServerConfig,
  sealSpotifyCookie,
  type SpotifyAuthState,
  type SpotifyServerConfig
} from "@/lib/spotify/server/session"

const config: SpotifyServerConfig = {
  clientId: "public-client-id",
  redirectUri: "https://ride.example.test/callback",
  sessionSecret: "a-test-session-secret-that-is-at-least-thirty-two-characters",
  secureCookies: true
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64url")
}

function cookieValue(response: Response, name: string): string | null {
  const header = response.headers.get("set-cookie") ?? ""
  const match = header.match(new RegExp(`(?:^|,\\s*)${name}=([^;]*)`))
  return match?.[1] ?? null
}

describe("Spotify PKCE authorization", () => {
  it("allows HTTPS or an explicit loopback IP redirect, never localhost", () => {
    expect(() => readSpotifyServerConfig({
      SPOTIFY_CLIENT_ID: "client-id",
      SPOTIFY_REDIRECT_URI: "http://localhost:3000/callback",
      SPOTIFY_SESSION_SECRET: config.sessionSecret
    })).toThrow(/HTTPS outside local development/)

    expect(readSpotifyServerConfig({
      SPOTIFY_CLIENT_ID: "client-id",
      SPOTIFY_REDIRECT_URI: "http://127.0.0.1:3000/callback",
      SPOTIFY_SESSION_SECRET: config.sessionSecret
    }).secureCookies).toBe(false)
  })

  it("creates a high-entropy verifier and matching S256 challenge", async () => {
    const pair = await createPkcePair()

    expect(pair.codeVerifier).toMatch(/^[A-Za-z0-9._~-]{64}$/)
    expect(pair.state).toMatch(/^[A-Za-z0-9._~-]{32}$/)
    expect(pair.codeChallenge).toBe(base64Url(createHash("sha256").update(pair.codeVerifier).digest()))
  })

  it("redirects to Spotify with the complete playback scope and an encrypted httpOnly flow cookie", async () => {
    const response = await handleSpotifyLogin(
      new Request("https://ride.example.test/api/spotify/login?returnTo=%2F%3Fplayer%3Dopen"),
      { config }
    )

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get("location")!)
    expect(location.origin + location.pathname).toBe("https://accounts.spotify.com/authorize")
    expect(location.searchParams.get("response_type")).toBe("code")
    expect(location.searchParams.get("client_id")).toBe(config.clientId)
    expect(location.searchParams.get("redirect_uri")).toBe(config.redirectUri)
    expect(location.searchParams.get("code_challenge_method")).toBe("S256")
    expect(location.searchParams.get("prompt")).toBe("consent")
    expect(location.searchParams.get("scope")?.split(" ")).toEqual(SPOTIFY_SCOPES)

    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain(`${SPOTIFY_OAUTH_COOKIE}=`)
    expect(setCookie).toContain("HttpOnly")
    expect(setCookie).toContain("Secure")
    expect(setCookie).toContain("SameSite=Lax")
    expect(setCookie).toContain("Max-Age=600")

    const flow = await openSpotifyCookie<SpotifyAuthState>(
      cookieValue(response, SPOTIFY_OAUTH_COOKIE)!,
      config.sessionSecret,
      "oauth"
    )
    expect(flow.returnTo).toBe("/?player=open")
    expect(flow.state).toBe(location.searchParams.get("state"))
    expect((await createPkcePair({ codeVerifier: flow.codeVerifier, state: flow.state })).codeChallenge)
      .toBe(location.searchParams.get("code_challenge"))
  })

  it("rejects a callback whose state does not match without exchanging the code", async () => {
    const fetcher = vi.fn()
    const flow: SpotifyAuthState = {
      codeVerifier: "v".repeat(64),
      state: "expected-state",
      returnTo: "/",
      createdAt: Date.now()
    }
    const cookie = await sealSpotifyCookie(flow, config.sessionSecret, "oauth")
    const request = new Request("https://ride.example.test/callback?code=authorization-code&state=wrong-state", {
      headers: { cookie: `${SPOTIFY_OAUTH_COOKIE}=${cookie}` }
    })

    const response = await handleSpotifyCallback(request, { config, fetcher })

    expect(response.status).toBe(400)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toMatchObject({ error: { code: "SPOTIFY_STATE_MISMATCH" } })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("returns a verified consent cancellation to the app instead of stranding the rider on JSON", async () => {
    const flow: SpotifyAuthState = {
      codeVerifier: "v".repeat(64),
      state: "expected-state",
      returnTo: "/?player=open",
      createdAt: Date.now()
    }
    const cookie = await sealSpotifyCookie(flow, config.sessionSecret, "oauth")
    const request = new Request(
      `https://ride.example.test/callback?error=access_denied&state=${flow.state}`,
      { headers: { cookie: `${SPOTIFY_OAUTH_COOKIE}=${cookie}` } }
    )

    const response = await handleSpotifyCallback(request, { config, fetcher: vi.fn() })

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(
      "https://ride.example.test/?player=open&spotify=access_denied"
    )
    expect(response.headers.get("set-cookie")).toContain(`${SPOTIFY_OAUTH_COOKIE}=;`)
  })

  it("exchanges a valid callback without a client secret and hands the encrypted session to the first-party player request", async () => {
    const now = Date.parse("2026-07-15T12:00:00Z")
    const flow: SpotifyAuthState = {
      codeVerifier: "verifier-value-that-is-long-enough-for-pkce-and-never-leaves-the-server",
      state: "matching-state",
      returnTo: "/?player=open",
      createdAt: now
    }
    const cookie = await sealSpotifyCookie(flow, config.sessionSecret, "oauth")
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST")
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(new Headers(init?.headers).get("authorization")).toBeNull()
      const body = new URLSearchParams(init?.body as string)
      expect(body.get("grant_type")).toBe("authorization_code")
      expect(body.get("client_id")).toBe(config.clientId)
      expect(body.get("code")).toBe("authorization-code")
      expect(body.get("code_verifier")).toBe(flow.codeVerifier)
      expect(body.get("redirect_uri")).toBe(config.redirectUri)
      expect(body.has("client_secret")).toBe(false)
      return Response.json({
        access_token: "short-lived-access-token",
        refresh_token: "long-lived-refresh-token",
        token_type: "Bearer",
        scope: SPOTIFY_SCOPES.join(" "),
        expires_in: 3600
      })
    })
    const request = new Request(`https://ride.example.test/callback?code=authorization-code&state=${flow.state}`, {
      headers: { cookie: `${SPOTIFY_OAUTH_COOKIE}=${cookie}` }
    })

    const handoffIssuer = vi.fn(() => "one-time-player-handoff")
    const response = await handleSpotifyCallback(request, {
      config,
      fetcher,
      now: () => now,
      handoffIssuer
    } as never)

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(
      "https://ride.example.test/?player=open&spotify=connected#spotify_handoff=one-time-player-handoff"
    )
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("set-cookie")).not.toContain("short-lived-access-token")
    expect(response.headers.get("set-cookie")).not.toContain("long-lived-refresh-token")
    expect(response.headers.get("set-cookie")).not.toContain(`${SPOTIFY_SESSION_COOKIE}=`)
    expect(handoffIssuer).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "short-lived-access-token",
      refreshToken: "long-lived-refresh-token",
      expiresAt: now + 3_600_000,
      scopes: SPOTIFY_SCOPES
    }))
  })

  it("turns the real callback handoff into a first-party encrypted session cookie", async () => {
    const now = Date.parse("2026-07-16T17:30:00Z")
    const flow: SpotifyAuthState = {
      codeVerifier: "verifier-value-that-is-long-enough-for-pkce-and-never-leaves-the-server",
      state: "matching-state",
      returnTo: "/?player=open",
      createdAt: now
    }
    const cookie = await sealSpotifyCookie(flow, config.sessionSecret, "oauth")
    const callback = await handleSpotifyCallback(
      new Request(`https://ride.example.test/callback?code=authorization-code&state=${flow.state}`, {
        headers: { cookie: `${SPOTIFY_OAUTH_COOKIE}=${cookie}` }
      }),
      {
        config,
        now: () => now,
        fetcher: vi.fn(async () => Response.json({
          access_token: "short-lived-access-token",
          refresh_token: "long-lived-refresh-token",
          token_type: "Bearer",
          scope: SPOTIFY_SCOPES.join(" "),
          expires_in: 3600
        }))
      }
    )
    const handoff = new URL(callback.headers.get("location")!).hash.replace("#spotify_handoff=", "")

    const token = await handleSpotifyToken(
      new Request("https://ride.example.test/api/spotify/token", {
        headers: { [SPOTIFY_HANDOFF_HEADER]: handoff }
      }),
      { config, now: () => now }
    )

    expect(token.status).toBe(200)
    expect(await token.json()).toEqual({
      accessToken: "short-lived-access-token",
      expiresAt: now + 3_600_000
    })
    expect(token.headers.get("set-cookie")).toContain(`${SPOTIFY_SESSION_COOKIE}=`)
    expect(await handleSpotifyToken(
      new Request("https://ride.example.test/api/spotify/token", {
        headers: { [SPOTIFY_HANDOFF_HEADER]: handoff }
      }),
      { config, now: () => now }
    )).toHaveProperty("status", 401)
  })

  it("reports a rejected app configuration to the player instead of returning a generic reconnect loop", async () => {
    const flow: SpotifyAuthState = {
      codeVerifier: "verifier-value-that-is-long-enough-for-pkce-and-never-leaves-the-server",
      state: "matching-state",
      returnTo: "/",
      createdAt: Date.now()
    }
    const cookie = await sealSpotifyCookie(flow, config.sessionSecret, "oauth")
    const request = new Request(`https://ride.example.test/callback?code=authorization-code&state=${flow.state}`, {
      headers: { cookie: `${SPOTIFY_OAUTH_COOKIE}=${cookie}` }
    })
    const fetcher = vi.fn(async () => Response.json({ error: "invalid_client" }, { status: 401 }))

    const response = await handleSpotifyCallback(request, { config, fetcher })

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(
      "https://ride.example.test/?spotify=client_configuration_failed"
    )
  })

  it("asks Spotify for explicit consent so a refresh token is always issued", async () => {
    const response = await handleSpotifyLogin(
      new Request("https://ride.example.test/api/spotify/login?returnTo=%2F"),
      { config }
    )
    const location = new URL(response.headers.get("location")!)
    expect(location.searchParams.get("prompt")).toBe("consent")
  })

  it("surfaces a missing refresh token as a connection failure instead of a silent loop", async () => {
    const flow: SpotifyAuthState = {
      codeVerifier: "v".repeat(64),
      state: "matching-state",
      returnTo: "/",
      createdAt: Date.now()
    }
    const cookie = await sealSpotifyCookie(flow, config.sessionSecret, "oauth")
    const request = new Request(`https://ride.example.test/callback?code=authorization-code&state=${flow.state}`, {
      headers: { cookie: `${SPOTIFY_OAUTH_COOKIE}=${cookie}` }
    })
    const fetcher = vi.fn(async () => Response.json({
      access_token: "short-lived-access-token",
      token_type: "Bearer",
      scope: SPOTIFY_SCOPES.join(" "),
      expires_in: 3600
    }))

    const response = await handleSpotifyCallback(request, { config, fetcher })

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(
      "https://ride.example.test/?spotify=connection_failed"
    )
    expect(response.headers.get("set-cookie")).not.toContain("short-lived-access-token")
  })

  it("rejects a tampered encrypted cookie", async () => {
    const sealed = await sealSpotifyCookie({ token: "private" }, config.sessionSecret, "session")
    const tampered = `${sealed.slice(0, -1)}${sealed.endsWith("a") ? "b" : "a"}`

    await expect(openSpotifyCookie(tampered, config.sessionSecret, "session")).rejects.toThrow()
  })
})
