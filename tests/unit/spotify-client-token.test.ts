import { afterEach, describe, expect, it, vi } from "vitest"
import { SpotifyBrowserTokenClient } from "@/lib/spotify/client-token"

describe("Spotify browser token client", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("bounds a stalled same-origin token request with an abort signal", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return Response.json({ accessToken: "access-token", expiresAt: Date.now() + 3_600_000 })
    })

    const client = new SpotifyBrowserTokenClient(fetcher)

    await expect(client.accessToken()).resolves.toBe("access-token")
  })

  it("still requests a token when the browser lacks AbortSignal.timeout", async () => {
    vi.stubGlobal("AbortSignal", {})
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeDefined()
      return Response.json({ accessToken: "access-token", expiresAt: Date.now() + 3_600_000 })
    })

    const client = new SpotifyBrowserTokenClient(fetcher)

    await expect(client.accessToken()).resolves.toBe("access-token")
  })

  it("claims a callback handoff only on the first same-origin token request", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const expectedHandoff = fetcher.mock.calls.length === 1 ? "one-time-player-handoff" : null
      expect(new Headers(init?.headers).get("x-switchback-spotify-handoff")).toBe(expectedHandoff)
      return Response.json({ accessToken: "access-token", expiresAt: Date.now() + 3_600_000 })
    })
    const HandoffClient = SpotifyBrowserTokenClient as unknown as new (
      fetcher: typeof fetch,
      handoff: string
    ) => SpotifyBrowserTokenClient
    const client = new HandoffClient(fetcher, "one-time-player-handoff")

    await expect(client.accessToken()).resolves.toBe("access-token")
    client.invalidate()
    await expect(client.accessToken()).resolves.toBe("access-token")
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
