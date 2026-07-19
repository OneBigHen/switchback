import { describe, expect, it, vi } from "vitest"
import { SPOTIFY_SCOPES } from "@/lib/spotify/constants"
import type { SpotifySession } from "@/lib/spotify/server/session"

describe("Spotify callback handoff store", () => {
  it("survives separate callback and token route module instances in one server process", async () => {
    const now = Date.parse("2026-07-16T18:00:00Z")
    const session: SpotifySession = {
      sessionId: "route-bundle-session",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: now + 3_600_000,
      refreshExpiresAt: now + 180 * 24 * 60 * 60 * 1000,
      scopes: SPOTIFY_SCOPES
    }
    const callbackBundle = await import("@/lib/spotify/server/handoff")
    const handoff = callbackBundle.issueSpotifyHandoff(session, now)

    vi.resetModules()
    const tokenBundle = await import("@/lib/spotify/server/handoff")

    expect(tokenBundle.consumeSpotifyHandoff(handoff, now)).toEqual(session)
    expect(tokenBundle.consumeSpotifyHandoff(handoff, now)).toBeNull()
  })
})
