import { describe, expect, it, vi } from "vitest"
import { handleSpotifyRemotePlayer } from "@/app/api/spotify/player/handler"
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

async function authorizedRequest(method = "GET", body?: unknown): Promise<Request> {
  const now = Date.parse("2026-07-16T18:00:00Z")
  const session: SpotifySession = {
    sessionId: "remote-player-session",
    accessToken: "remote-player-access-token",
    refreshToken: "remote-player-refresh-token",
    expiresAt: now + 3_600_000,
    refreshExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
    scopes: SPOTIFY_SCOPES
  }
  const cookie = await sealSpotifyCookie(session, config.sessionSecret, "session")
  return new Request("https://ride.example.test/api/spotify/player", {
    method,
    headers: {
      cookie: `${SPOTIFY_SESSION_COOKIE}=${cookie}`,
      origin: "https://ride.example.test",
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}

describe("Spotify remote player API", () => {
  it("returns the active Spotify app or Connect device and its current track", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toBe("https://api.spotify.com/v1/me/player?additional_types=track%2Cepisode")
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer remote-player-access-token")
      return Response.json({
        device: {
          id: "phone-device",
          is_active: true,
          is_restricted: false,
          name: "Henning's Phone",
          type: "Smartphone",
          volume_percent: 62,
          supports_volume: true
        },
        is_playing: true,
        progress_ms: 42_000,
        item: {
          id: "track-id",
          uri: "spotify:track:track-id",
          type: "track",
          name: "Midnight Switchbacks",
          duration_ms: 240_000,
          artists: [{ name: "Ridge Runner" }],
          album: {
            name: "Night Roads",
            images: [{ url: "https://image.example.test/album.jpg", width: 300, height: 300 }]
          }
        }
      })
    })

    const response = await handleSpotifyRemotePlayer(await authorizedRequest(), {
      config,
      fetcher,
      now: () => Date.parse("2026-07-16T18:00:00Z")
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      active: true,
      state: {
        device: {
          id: "phone-device",
          name: "Henning's Phone",
          type: "Smartphone",
          isRestricted: false,
          volumePercent: 62,
          supportsVolume: true
        },
        isPlaying: true,
        position: 42_000,
        duration: 240_000,
        track: {
          id: "track-id",
          uri: "spotify:track:track-id",
          type: "track",
          name: "Midnight Switchbacks",
          artists: ["Ridge Runner"],
          album: {
            name: "Night Roads",
            images: [{ url: "https://image.example.test/album.jpg", width: 300, height: 300 }]
          }
        }
      }
    })
  })

  it("reports a connected account with no active Spotify device", async () => {
    const response = await handleSpotifyRemotePlayer(await authorizedRequest(), {
      config,
      fetcher: vi.fn(async () => new Response(null, { status: 204 })),
      now: () => Date.parse("2026-07-16T18:00:00Z")
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ active: false, state: null })
  })

  it("controls the already-active Spotify app instead of transferring playback into the browser", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.spotify.com/v1/me/player/pause")
      expect(init?.method).toBe("PUT")
      expect(init?.body).toBeUndefined()
      return new Response(null, { status: 204 })
    })

    const response = await handleSpotifyRemotePlayer(
      await authorizedRequest("POST", { command: "pause" }),
      { config, fetcher, now: () => Date.parse("2026-07-16T18:00:00Z") }
    )

    expect(response.status).toBe(204)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("explains when Spotify has no active app or Connect device to control", async () => {
    const response = await handleSpotifyRemotePlayer(
      await authorizedRequest("POST", { command: "play" }),
      {
        config,
        fetcher: vi.fn(async () => Response.json(
          { error: { status: 404, message: "Player command failed: No active device found" } },
          { status: 404 }
        )),
        now: () => Date.parse("2026-07-16T18:00:00Z")
      }
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "SPOTIFY_NO_ACTIVE_DEVICE" } })
  })
})
