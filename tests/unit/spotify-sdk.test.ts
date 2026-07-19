import { afterEach, describe, expect, it } from "vitest"
import { createSpotifySdkLoader, type SpotifyNamespace } from "@/lib/spotify/web-playback-sdk"

afterEach(() => {
  document.querySelectorAll('script[src="https://sdk.scdn.co/spotify-player.js"]').forEach((script) => script.remove())
  delete window.Spotify
  delete window.onSpotifyWebPlaybackSDKReady
})

describe("Spotify Web Playback SDK loader", () => {
  it("loads the official SDK once and resolves every waiter on the global ready callback", async () => {
    const load = createSpotifySdkLoader(window, document)
    const first = load()
    const second = load()
    const scripts = document.querySelectorAll('script[src="https://sdk.scdn.co/spotify-player.js"]')

    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toHaveAttribute("async")

    const spotify = { Player: class {} } as unknown as SpotifyNamespace
    window.Spotify = spotify
    window.onSpotifyWebPlaybackSDKReady?.()

    await expect(first).resolves.toBe(spotify)
    await expect(second).resolves.toBe(spotify)
  })

  it("removes a failed script so a later load can recover", async () => {
    const load = createSpotifySdkLoader(window, document)
    const first = load()
    const failedScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://sdk.scdn.co/spotify-player.js"]'
    )!

    failedScript.dispatchEvent(new Event("error"))

    await expect(first).rejects.toThrow(/could not be loaded/i)
    expect(failedScript).not.toBeInTheDocument()

    const second = load()
    const retryScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://sdk.scdn.co/spotify-player.js"]'
    )!
    expect(retryScript).not.toBe(failedScript)
    const spotify = { Player: class {} } as unknown as SpotifyNamespace
    window.Spotify = spotify
    window.onSpotifyWebPlaybackSDKReady?.()

    await expect(second).resolves.toBe(spotify)
  })
})
