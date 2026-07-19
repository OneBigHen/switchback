import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SpotifyPlayerDock } from "@/components/spotify/SpotifyPlayerDock"
import { SPOTIFY_AUTH_CHANNEL, SPOTIFY_AUTH_STORAGE_KEY } from "@/lib/spotify/auth-outcome"
import { usePlannerStore } from "@/stores/planner-store"

const loadSdk = vi.hoisted(() => vi.fn())

vi.mock("@/lib/spotify/web-playback-sdk", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/spotify/web-playback-sdk")>()
  return { ...original, loadSpotifyWebPlaybackSdk: loadSdk }
})

class FakeBroadcastChannel {
  static latest: FakeBroadcastChannel | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  readonly close = vi.fn()

  constructor(readonly name: string) {
    FakeBroadcastChannel.latest = this
  }

  emit(data: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data }))
  }
}

const playback = {
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
}

function connectedFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/spotify/token") {
      return Response.json({ accessToken: "browser-access-token", expiresAt: Date.now() + 3_600_000 })
    }
    if (String(input) === "/api/spotify/player" && (init?.method ?? "GET") === "GET") {
      return Response.json(playback)
    }
    if (String(input) === "/api/spotify/player" && init?.method === "POST") {
      return new Response(null, { status: 204 })
    }
    if (String(input) === "/api/spotify/disconnect") return new Response(null, { status: 204 })
    throw new Error(`Unexpected request: ${String(input)}`)
  })
}

describe("Spotify mini player", () => {
  beforeEach(() => {
    usePlannerStore.getState().setSurface("planner")
    FakeBroadcastChannel.latest = null
    loadSdk.mockReset()
    vi.stubGlobal("fetch", connectedFetch())
  })

  afterEach(() => {
    usePlannerStore.getState().setSurface("planner")
    cleanup()
    vi.unstubAllGlobals()
    window.localStorage.removeItem(SPOTIFY_AUTH_STORAGE_KEY)
    window.history.replaceState(null, "", "/")
  })

  it("shows the track playing on the active Spotify app without creating or transferring to a browser player", async () => {
    render(<SpotifyPlayerDock />)

    expect(await screen.findByText("Midnight Switchbacks")).toBeInTheDocument()
    expect(screen.getByText(/Ridge Runner/)).toBeInTheDocument()
    expect(screen.getByText(/Henning's Phone/)).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Night Roads album cover" })).toHaveAttribute(
      "src",
      "https://image.example.test/album.jpg"
    )
    expect(screen.getByRole("slider", { name: "Track position" })).toHaveValue("42000")
    expect(loadSdk).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalledWith("/api/spotify/transfer", expect.anything())
  })

  it("controls the active Spotify app through the remote player endpoint", async () => {
    const fetcher = connectedFetch()
    vi.stubGlobal("fetch", fetcher)
    render(<SpotifyPlayerDock />)
    await screen.findByText("Midnight Switchbacks")

    fireEvent.click(screen.getByRole("button", { name: "Pause Midnight Switchbacks" }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(
      "/api/spotify/player",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ command: "pause" }) })
    ))

    fireEvent.click(screen.getByRole("button", { name: "Next track" }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(
      "/api/spotify/player",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ command: "next" }) })
    ))

    fireEvent.change(screen.getByRole("slider", { name: "Track position" }), { target: { value: "80000" } })
    fireEvent.pointerUp(screen.getByRole("slider", { name: "Track position" }))
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(
      "/api/spotify/player",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ command: "seek", positionMs: 80_000 }) })
    ))

    fireEvent.change(screen.getByRole("slider", { name: "Spotify volume" }), { target: { value: "25" } })
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(
      "/api/spotify/player",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ command: "volume", volumePercent: 25 }) })
    ))
  })

  it("keeps the account connected and explains how to activate Spotify when no device is playing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/spotify/token") {
        return Response.json({ accessToken: "browser-access-token", expiresAt: Date.now() + 3_600_000 })
      }
      if (String(input) === "/api/spotify/player") return Response.json({ active: false, state: null })
      throw new Error(`Unexpected request: ${String(input)}`)
    }))

    render(<SpotifyPlayerDock />)

    expect(await screen.findByText(/Open Spotify and start a song/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open Spotify" })).toHaveAttribute("href", "https://open.spotify.com/")
    expect(screen.queryByRole("link", { name: /Connect Spotify/i })).not.toBeInTheDocument()
  })

  it("explains when remote playback controls require Premium", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/spotify/token") {
        return Response.json({ accessToken: "browser-access-token", expiresAt: Date.now() + 3_600_000 })
      }
      if (String(input) === "/api/spotify/player" && (init?.method ?? "GET") === "GET") {
        return Response.json(playback)
      }
      if (String(input) === "/api/spotify/player") {
        return Response.json(
          { error: { code: "SPOTIFY_PREMIUM_REQUIRED", message: "Spotify Premium is required." } },
          { status: 403 }
        )
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    }))

    render(<SpotifyPlayerDock />)
    await screen.findByText("Midnight Switchbacks")
    fireEvent.click(screen.getByRole("button", { name: "Pause Midnight Switchbacks" }))

    expect(await screen.findByText(/Spotify Premium is required/i)).toBeInTheDocument()
  })

  it("offers a same-tab connect action when there is no encrypted server session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: { code: "SPOTIFY_NOT_CONNECTED" } },
      { status: 401 }
    )))

    render(<SpotifyPlayerDock />)

    const link = await screen.findByRole("link", { name: /Connect Spotify/i })
    expect(screen.getByLabelText("Spotify player").className).toMatch(/compactPrompt/)
    expect(link).toHaveAttribute("href", "/api/spotify/login?returnTo=%2F%3Fplayer%3Dopen")
    expect(link).not.toHaveAttribute("target")
    expect(loadSdk).not.toHaveBeenCalled()
    fireEvent.click(link)
    expect(await screen.findByText(/Finish sign-in in Spotify/i)).toBeInTheDocument()
  })

  it("rechecks the encrypted session when the rider returns from Spotify", async () => {
    let connected = false
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/spotify/token") {
        return connected
          ? Response.json({ accessToken: "browser-access-token", expiresAt: Date.now() + 3_600_000 })
          : Response.json({ error: { code: "SPOTIFY_NOT_CONNECTED" } }, { status: 401 })
      }
      if (String(input) === "/api/spotify/player") return Response.json(playback)
      throw new Error(`Unexpected request: ${String(input)}`)
    }))

    render(<SpotifyPlayerDock />)
    await screen.findByRole("link", { name: /Connect Spotify/i })
    fireEvent.click(screen.getByRole("link", { name: /Connect Spotify/i }))
    connected = true
    fireEvent.focus(window)

    expect(await screen.findByText("Midnight Switchbacks")).toBeInTheDocument()
  })

  it("claims the callback handoff from the URL fragment before reading remote playback", async () => {
    const fetcher = connectedFetch()
    vi.stubGlobal("fetch", fetcher)
    window.history.replaceState(null, "", "/#spotify_handoff=12345678-1234-1234-1234-123456789abc")

    render(<SpotifyPlayerDock />)

    await screen.findByText("Midnight Switchbacks")
    expect(fetcher).toHaveBeenCalledWith(
      "/api/spotify/token",
      expect.objectContaining({
        headers: expect.objectContaining({})
      })
    )
    const tokenCall = fetcher.mock.calls.find(([input]) => String(input) === "/api/spotify/token")
    expect(new Headers(tokenCall?.[1]?.headers).get("x-switchback-spotify-handoff")).toBe(
      "12345678-1234-1234-1234-123456789abc"
    )
  })

  it("uses a completion result saved when cross-tab events are lost", async () => {
    let connected = false
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/spotify/token") {
        return connected
          ? Response.json({ accessToken: "browser-access-token", expiresAt: Date.now() + 3_600_000 })
          : Response.json({ error: { code: "SPOTIFY_NOT_CONNECTED" } }, { status: 401 })
      }
      if (String(input) === "/api/spotify/player") return Response.json(playback)
      throw new Error(`Unexpected request: ${String(input)}`)
    }))

    render(<SpotifyPlayerDock />)
    await screen.findByRole("link", { name: /Connect Spotify/i })
    fireEvent.click(screen.getByRole("link", { name: /Connect Spotify/i }))
    connected = true
    window.localStorage.setItem(SPOTIFY_AUTH_STORAGE_KEY, JSON.stringify({
      type: SPOTIFY_AUTH_CHANNEL,
      result: "connected"
    }))

    expect(await screen.findByText("Midnight Switchbacks")).toBeInTheDocument()
  })

  it("accepts a BroadcastChannel authorization completion", async () => {
    let connected = false
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel)
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/spotify/token") {
        return connected
          ? Response.json({ accessToken: "browser-access-token", expiresAt: Date.now() + 3_600_000 })
          : Response.json({ error: { code: "SPOTIFY_NOT_CONNECTED" } }, { status: 401 })
      }
      if (String(input) === "/api/spotify/player") return Response.json(playback)
      throw new Error(`Unexpected request: ${String(input)}`)
    }))

    render(<SpotifyPlayerDock />)
    await screen.findByRole("link", { name: /Connect Spotify/i })
    connected = true
    act(() => FakeBroadcastChannel.latest?.emit({
      type: "switchback.spotify.authorization",
      result: "connected"
    }))

    expect(await screen.findByText("Midnight Switchbacks")).toBeInTheDocument()
  })

  it("can hide and restore the floating music dock", async () => {
    render(<SpotifyPlayerDock />)
    await screen.findByText("Midnight Switchbacks")
    fireEvent.click(screen.getByRole("button", { name: "Hide Spotify player" }))

    expect(screen.queryByLabelText("Spotify player")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Show Spotify player" }))
    expect(await screen.findByLabelText("Spotify player")).toBeInTheDocument()
  })

  it("keeps the utility buttons separate from play and lets the detail panel expand again", async () => {
    render(<SpotifyPlayerDock />)
    await screen.findByText("Midnight Switchbacks")

    const dock = screen.getByLabelText("Spotify player")
    const header = dock.querySelector("[data-spotify-header]")
    const pause = screen.getByRole("button", { name: "Pause Midnight Switchbacks" })
    const hide = screen.getByRole("button", { name: "Hide Spotify player" })
    expect(header).toContainElement(pause)
    expect(header).toContainElement(hide)

    fireEvent.click(screen.getByRole("button", { name: "Collapse music controls" }))
    expect(screen.queryByRole("slider", { name: "Track position" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Expand music controls" }))
    expect(await screen.findByRole("slider", { name: "Track position" })).toBeInTheDocument()
  })

  it("shows a useful callback failure instead of silently returning to the connect prompt", async () => {
    window.history.replaceState(null, "", "/?spotify=connection_failed")
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: { code: "SPOTIFY_NOT_CONNECTED" } },
      { status: 401 }
    )))

    render(<SpotifyPlayerDock />)

    const dock = await screen.findByLabelText("Spotify player")
    await waitFor(() => expect(dock).toHaveTextContent(/could not finish sign-in/i))
    await waitFor(() => expect(window.location.search).toBe(""))
  })

  it("uses a compact ride-safe rail without full controls", async () => {
    usePlannerStore.getState().setSurface("ride")
    render(<SpotifyPlayerDock />)

    const dock = await screen.findByLabelText("Spotify player")
    expect(dock).toHaveAttribute("data-layout", "ride-rail")
    expect(await screen.findByText("Midnight Switchbacks")).toBeInTheDocument()
    expect(screen.queryByRole("slider", { name: "Track position" })).not.toBeInTheDocument()
    expect(screen.queryByRole("slider", { name: "Spotify volume" })).not.toBeInTheDocument()
  })

  it("does not cover guidance with a connect prompt during an active ride", async () => {
    usePlannerStore.getState().setSurface("ride")
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { error: { code: "SPOTIFY_NOT_CONNECTED" } },
      { status: 401 }
    )))

    render(<SpotifyPlayerDock />)

    await waitFor(() => expect(screen.queryByLabelText("Spotify player")).not.toBeInTheDocument())
  })
})
