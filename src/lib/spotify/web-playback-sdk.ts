export interface SpotifyWebPlaybackImage {
  url: string
  width?: number | null
  height?: number | null
}

export interface SpotifyWebPlaybackTrack {
  id: string | null
  uri: string
  name: string
  artists: Array<{ name: string }>
  album: {
    name: string
    images: SpotifyWebPlaybackImage[]
  }
}

export interface SpotifyWebPlaybackState {
  paused: boolean
  position: number
  duration: number
  track_window: {
    current_track: SpotifyWebPlaybackTrack
  }
}

export interface SpotifyPlayerOptions {
  name: string
  getOAuthToken: (callback: (accessToken: string) => void) => void
  volume?: number
  enableMediaSession?: boolean
}

export interface SpotifyPlayerEventMap {
  ready: { device_id: string }
  not_ready: { device_id: string }
  player_state_changed: SpotifyWebPlaybackState | null
  autoplay_failed: null
  initialization_error: { message: string }
  authentication_error: { message: string }
  account_error: { message: string }
  playback_error: { message: string }
}

export interface SpotifyPlayer {
  connect(): Promise<boolean>
  disconnect(): void
  addListener<K extends keyof SpotifyPlayerEventMap>(
    event: K,
    callback: (value: SpotifyPlayerEventMap[K]) => void
  ): boolean
  removeListener<K extends keyof SpotifyPlayerEventMap>(
    event: K,
    callback?: (value: SpotifyPlayerEventMap[K]) => void
  ): boolean
  activateElement(): Promise<void>
  togglePlay(): Promise<void>
  nextTrack(): Promise<void>
  previousTrack(): Promise<void>
  seek(positionMs: number): Promise<void>
  setVolume(volume: number): Promise<void>
}

export interface SpotifyNamespace {
  Player: new (options: SpotifyPlayerOptions) => SpotifyPlayer
}

declare global {
  interface Window {
    Spotify?: SpotifyNamespace
    onSpotifyWebPlaybackSDKReady?: () => void
  }
}

const SDK_URL = "https://sdk.scdn.co/spotify-player.js"

export function createSpotifySdkLoader(
  targetWindow: Window,
  targetDocument: Document
): () => Promise<SpotifyNamespace> {
  let pending: Promise<SpotifyNamespace> | null = null
  return () => {
    if (targetWindow.Spotify) return Promise.resolve(targetWindow.Spotify)
    if (pending) return pending

    pending = new Promise<SpotifyNamespace>((resolve, reject) => {
      const previousReady = targetWindow.onSpotifyWebPlaybackSDKReady
      let script = targetDocument.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`)
      if (!script) {
        script = targetDocument.createElement("script")
        script.src = SDK_URL
        script.async = true
        // Cross-origin mode lets a future SRI `integrity` attribute be
        // enforced; without it, an injected third-party script can't read
        // window.Spotify state in anonymous mode anyway.
        script.crossOrigin = "anonymous"
        script.setAttribute("async", "")
        targetDocument.head.append(script)
      }

      let settled = false
      const restoreReadyCallback = () => {
        if (targetWindow.onSpotifyWebPlaybackSDKReady === ready) {
          targetWindow.onSpotifyWebPlaybackSDKReady = previousReady
        }
      }
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        targetWindow.clearTimeout(timeout)
        script.removeEventListener("error", onError)
        script.remove()
        restoreReadyCallback()
        pending = null
        reject(error)
      }
      const onError = () => fail(new Error("Spotify Web Playback SDK could not be loaded."))
      const ready = () => {
        try {
          previousReady?.()
        } catch {
          // Another SDK consumer must not prevent this player from initializing.
        }
        if (!targetWindow.Spotify) {
          fail(new Error("Spotify SDK reported ready without exposing its player."))
          return
        }
        if (settled) return
        settled = true
        targetWindow.clearTimeout(timeout)
        script.removeEventListener("error", onError)
        restoreReadyCallback()
        resolve(targetWindow.Spotify)
      }
      const timeout = targetWindow.setTimeout(() => {
        fail(new Error("Spotify Web Playback SDK timed out while loading."))
      }, 15_000)

      targetWindow.onSpotifyWebPlaybackSDKReady = ready
      script.addEventListener("error", onError, { once: true })
    })
    return pending
  }
}

let defaultLoader: (() => Promise<SpotifyNamespace>) | null = null

export function loadSpotifyWebPlaybackSdk(): Promise<SpotifyNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Spotify Web Playback SDK is browser-only."))
  }
  defaultLoader ??= createSpotifySdkLoader(window, document)
  return defaultLoader()
}
