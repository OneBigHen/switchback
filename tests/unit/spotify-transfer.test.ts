import { describe, expect, it, vi } from "vitest"
import { handleSpotifyTransfer } from "@/app/api/spotify/transfer/handler"
import { SPOTIFY_SCOPES } from "@/lib/spotify/constants"
import {
  SPOTIFY_SESSION_COOKIE,
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

async function requestFor(deviceId: string): Promise<Request> {
  const now = Date.now()
  const session: SpotifySession = {
    sessionId: "spotify-transfer-session",
    accessToken: "browser-player-access-token",
    refreshToken: "refresh-token",
    expiresAt: now + 5 * 60_000,
    refreshExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    scopes: SPOTIFY_SCOPES
  }
  const cookie = await sealSpotifyCookie(session, config.sessionSecret, "session")
  return new Request("https://ride.example.test/api/spotify/transfer", {
    method: "POST",
    headers: {
      cookie: `${SPOTIFY_SESSION_COOKIE}=${cookie}`,
      "content-type": "application/json",
      origin: "https://ride.example.test"
    },
    body: JSON.stringify({ deviceId })
  })
}

describe("Spotify device transfer", () => {
  it("transfers playback to the SDK device without starting audio", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.spotify.com/v1/me/player")
      expect(init?.method).toBe("PUT")
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer browser-player-access-token")
      expect(JSON.parse(String(init?.body))).toEqual({ device_ids: ["sdk-device-id"], play: false })
      return new Response(null, { status: 204 })
    })

    const response = await handleSpotifyTransfer(await requestFor("sdk-device-id"), { config, fetcher })

    expect(response.status).toBe(204)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("turns Spotify's Premium-only response into a useful client error", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: "Premium required" } }, { status: 403 }))

    const response = await handleSpotifyTransfer(await requestFor("sdk-device-id"), { config, fetcher })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "SPOTIFY_PREMIUM_REQUIRED" } })
  })

  it("does not mislabel a development-mode access denial as a Premium problem", async () => {
    const fetcher = vi.fn(async () => Response.json(
      { error: { message: "User not registered in the Developer Dashboard" } },
      { status: 403 }
    ))

    const response = await handleSpotifyTransfer(await requestFor("sdk-device-id"), { config, fetcher })

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "SPOTIFY_ACCESS_DENIED" } })
  })
})
