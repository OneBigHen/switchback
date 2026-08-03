"use client"

import Image from "next/image"
import {
  CaretDown,
  CaretUp,
  DotsSixVertical,
  MusicNotes,
  Pause,
  Play,
  SignOut,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  SpotifyLogo,
  WarningCircle,
  X
} from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { browserRequestSignal } from "@/lib/client/request-timeout"
import { SpotifyBrowserTokenClient, SpotifyClientError } from "@/lib/spotify/client-token"
import { publicSwitchbackHttpsUrl } from "@/lib/spotify/public-origin"
import type {
  SpotifyRemoteCommand,
  SpotifyRemotePlaybackResponse,
  SpotifyRemoteState,
  SpotifyRemoteTrack
} from "@/lib/spotify/remote-player"
import {
  SPOTIFY_AUTH_CHANNEL,
  SPOTIFY_AUTH_STORAGE_KEY,
  isSpotifyAuthNotification,
  isSpotifyAuthResult,
  spotifyAuthOutcomeMessage,
  type SpotifyAuthResult
} from "@/lib/spotify/auth-outcome"
import { usePlannerStore } from "@/stores/planner-store"
import styles from "./SpotifyPlayerDock.module.css"

type PlayerStatus = "checking" | "ready" | "disconnected" | "premium" | "error"
type DockPosition = { left: number; top: number }
type SpotifyApiError = { error?: { code?: string; message?: string } }

const AUTH_RESULT_POLL_INTERVAL_MS = 250
const PLAYBACK_POLL_INTERVAL_MS = 5_000
const NO_ACTIVE_DEVICE_MESSAGE = "Open Spotify and start a song, then return here."

function clock(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function artists(track: SpotifyRemoteTrack | null): string {
  return track?.artists.join(", ") || "Spotify"
}

function savedSpotifyAuthorizationResult(): SpotifyAuthResult | null {
  try {
    const stored = window.localStorage.getItem(SPOTIFY_AUTH_STORAGE_KEY)
    if (!stored) return null
    const notification: unknown = JSON.parse(stored)
    return isSpotifyAuthNotification(notification) ? notification.result : null
  } catch {
    return null
  }
}

function clearSavedSpotifyAuthorizationResult(): void {
  try {
    window.localStorage.removeItem(SPOTIFY_AUTH_STORAGE_KEY)
  } catch {
    // Private browsing can deny storage access; BroadcastChannel and focus checks remain available.
  }
}

function callbackHandoff(): string | null {
  try {
    const handoff = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("spotify_handoff")
    return handoff && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(handoff) ? handoff : null
  } catch {
    return null
  }
}

function clearCallbackHandoff(): void {
  const url = new URL(window.location.href)
  if (!new URLSearchParams(url.hash.replace(/^#/, "")).has("spotify_handoff")) return
  url.hash = ""
  window.history.replaceState(null, "", `${url.pathname}${url.search}`)
}

function isPlaybackResponse(value: unknown): value is SpotifyRemotePlaybackResponse {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<SpotifyRemotePlaybackResponse>
  return typeof candidate.active === "boolean"
    && (candidate.state === null || typeof candidate.state === "object")
}

async function apiError(response: Response): Promise<SpotifyApiError["error"]> {
  const payload = await response.json().catch(() => null) as SpotifyApiError | null
  return payload?.error
}

export function SpotifyPlayerDock() {
  const rideMode = usePlannerStore((planner) => planner.surface === "ride")
  const [tokenClient] = useState(() => new SpotifyBrowserTokenClient(fetch, callbackHandoff()))
  const refreshTimerRef = useRef<number | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  const [status, setStatus] = useState<PlayerStatus>("checking")
  const [connected, setConnected] = useState(false)
  const [active, setActive] = useState(false)
  const [state, setState] = useState<SpotifyRemoteState | null>(null)
  const [position, setPosition] = useState(0)
  const [volume, setVolume] = useState(50)
  const [collapsed, setCollapsed] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [dockPosition, setDockPosition] = useState<DockPosition | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [authResult, setAuthResult] = useState<SpotifyAuthResult | null>(() => {
    if (typeof window === "undefined") return null
    const result = new URLSearchParams(window.location.search).get("spotify")
    return isSpotifyAuthResult(result) ? result : null
  })
  const [authInProgress, setAuthInProgress] = useState(false)
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const acceptedAuthorizationRef = useRef<SpotifyAuthResult | null>(null)
  const authOutcome = spotifyAuthOutcomeMessage(authResult)

  useEffect(() => {
    const target = publicSwitchbackHttpsUrl(window.location)
    if (target) window.location.replace(target)
  }, [])

  const failAuthorization = useCallback((text: string) => {
    setConnected(false)
    setActive(false)
    setState(null)
    setPosition(0)
    setStatus("disconnected")
    setMessage(text)
  }, [])

  const acceptAuthorization = useCallback((result: SpotifyAuthResult) => {
    if (acceptedAuthorizationRef.current === result) return
    acceptedAuthorizationRef.current = result
    setAuthInProgress(false)
    setAuthResult(result)
    if (result !== "connected") {
      failAuthorization(spotifyAuthOutcomeMessage(result) ?? "Spotify could not finish sign-in.")
      return
    }
    tokenClient.invalidate()
    setConnected(false)
    setActive(false)
    setState(null)
    setPosition(0)
    setStatus("checking")
    setMessage(spotifyAuthOutcomeMessage(result))
    setConnectionAttempt((attempt) => attempt + 1)
  }, [failAuthorization, tokenClient])

  const recheckAuthorization = useCallback(() => {
    if (!authInProgress) return
    tokenClient.invalidate()
    void tokenClient.accessToken()
      .then(() => acceptAuthorization("connected"))
      .catch(() => {
        setMessage("Spotify is still waiting for sign-in. Finish Spotify, then return here and check again.")
      })
  }, [acceptAuthorization, authInProgress, tokenClient])

  useEffect(() => {
    if (!authResult) return
    const url = new URL(window.location.href)
    url.searchParams.delete("spotify")
    url.searchParams.delete("player")
    url.hash = ""
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [authResult])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SPOTIFY_AUTH_STORAGE_KEY || !event.newValue) return
      try {
        const value: unknown = JSON.parse(event.newValue)
        if (isSpotifyAuthNotification(value)) acceptAuthorization(value.result)
      } catch {
        // Ignore malformed cross-tab storage events.
      }
    }
    const channel = typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(SPOTIFY_AUTH_CHANNEL)
    if (channel) {
      channel.onmessage = (event) => {
        if (isSpotifyAuthNotification(event.data)) acceptAuthorization(event.data.result)
      }
    }
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("storage", onStorage)
      channel?.close()
    }
  }, [acceptAuthorization])

  useEffect(() => {
    if (!authInProgress) return
    const consumeSavedAuthorization = () => {
      const result = savedSpotifyAuthorizationResult()
      if (!result) return
      clearSavedSpotifyAuthorizationResult()
      acceptAuthorization(result)
    }
    consumeSavedAuthorization()
    const interval = window.setInterval(consumeSavedAuthorization, AUTH_RESULT_POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [acceptAuthorization, authInProgress])

  useEffect(() => {
    if (!authInProgress) return
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") recheckAuthorization()
    }
    window.addEventListener("focus", recheckAuthorization)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("focus", recheckAuthorization)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [authInProgress, recheckAuthorization])

  const loadPlayback = useCallback(async () => {
    let response: Response
    try {
      response = await fetch("/api/spotify/player", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: browserRequestSignal(10_000)
      })
    } catch {
      setStatus("error")
      setMessage("Spotify player status is temporarily unavailable.")
      return
    }

    if (!response.ok) {
      const error = await apiError(response)
      if (response.status === 401 || error?.code === "SPOTIFY_REAUTH_REQUIRED" || error?.code === "SPOTIFY_SCOPES_MISSING") {
        tokenClient.invalidate()
        failAuthorization(error?.code === "SPOTIFY_SCOPES_MISSING"
          ? "Spotify permissions changed. Connect again to approve playback controls."
          : "Your Spotify session expired. Connect again to keep listening.")
        return
      }
      if (error?.code === "SPOTIFY_ACCESS_DENIED") {
        setConnected(false)
        setStatus("error")
        setMessage("This Spotify account is not authorized for the Switchback app.")
        return
      }
      setStatus("error")
      setMessage(error?.message ?? "Spotify player status is temporarily unavailable.")
      return
    }

    const payload: unknown = await response.json().catch(() => null)
    if (!isPlaybackResponse(payload)) {
      setStatus("error")
      setMessage("Spotify returned an unreadable player status.")
      return
    }

    setConnected(true)
    setActive(payload.active)
    setState(payload.state)
    setPosition(payload.state?.position ?? 0)
    if (payload.state?.device?.volumePercent !== null && payload.state?.device?.volumePercent !== undefined) {
      setVolume(payload.state.device.volumePercent)
    }
    setStatus("ready")
    setMessage(null)
    setAuthResult(null)
  }, [failAuthorization, tokenClient])

  useEffect(() => {
    if (publicSwitchbackHttpsUrl(window.location)) return
    let disposed = false
    let pollInterval: number | null = null

    const initialize = async () => {
      try {
        await tokenClient.accessToken()
        if (disposed) return
        clearCallbackHandoff()
        setConnected(true)
        await loadPlayback()
        if (disposed) return
        pollInterval = window.setInterval(() => void loadPlayback(), PLAYBACK_POLL_INTERVAL_MS)
      } catch (error) {
        if (disposed) return
        if (error instanceof SpotifyClientError && (
          error.status === 401
          || error.code === "SPOTIFY_REAUTH_REQUIRED"
          || error.code === "SPOTIFY_SCOPES_MISSING"
        )) {
          failAuthorization("Connect Spotify for music controls while you ride.")
        } else if (error instanceof SpotifyClientError && error.code === "SPOTIFY_NOT_CONFIGURED") {
          setConnected(false)
          setStatus("error")
          setMessage("Spotify is not configured on this Switchback server.")
        } else {
          setConnected(false)
          setStatus("error")
          setMessage("Spotify controls are unavailable right now.")
        }
      }
    }

    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void loadPlayback()
    }
    void initialize()
    window.addEventListener("focus", refreshOnFocus)
    document.addEventListener("visibilitychange", refreshOnFocus)
    return () => {
      disposed = true
      if (pollInterval !== null) window.clearInterval(pollInterval)
      window.removeEventListener("focus", refreshOnFocus)
      document.removeEventListener("visibilitychange", refreshOnFocus)
    }
  }, [connectionAttempt, failAuthorization, loadPlayback, tokenClient])

  useEffect(() => {
    if (!state?.isPlaying) return
    const interval = window.setInterval(() => {
      setPosition((current) => Math.min(state.duration, current + 1000))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [state?.duration, state?.isPlaying])

  useEffect(() => () => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    dragCleanupRef.current?.()
  }, [])

  const track = state?.track ?? null
  const cover = track?.album.images[0]?.url ?? null
  const controlsEnabled = status === "ready" && active && Boolean(track) && !state?.device?.isRestricted
  const volumeEnabled = controlsEnabled && Boolean(state?.device?.supportsVolume)
  const compact = rideMode || collapsed

  const run = async (command: SpotifyRemoteCommand) => {
    try {
      const response = await fetch("/api/spotify/player", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(command),
        signal: browserRequestSignal(10_000)
      })
      if (!response.ok) {
        const error = await apiError(response)
        if (response.status === 401 || error?.code === "SPOTIFY_REAUTH_REQUIRED") {
          tokenClient.invalidate()
          failAuthorization("Your Spotify session expired. Connect again to keep listening.")
          return
        }
        if (error?.code === "SPOTIFY_NO_ACTIVE_DEVICE") {
          setActive(false)
          setMessage(NO_ACTIVE_DEVICE_MESSAGE)
          return
        }
        if (error?.code === "SPOTIFY_PREMIUM_REQUIRED") {
          setMessage("Spotify Premium is required for remote playback controls.")
          return
        }
        setMessage(error?.message ?? "Spotify did not accept that playback command. Try again.")
        return
      }

      setMessage(null)
      if (command.command === "play" || command.command === "pause") {
        setState((current) => current ? { ...current, isPlaying: command.command === "play" } : current)
      }
      if (command.command === "seek") setPosition(command.positionMs)
      if (command.command === "volume") setVolume(command.volumePercent)
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = window.setTimeout(() => void loadPlayback(), 400)
    } catch {
      setMessage("Spotify did not accept that playback command. Try again.")
    }
  }

  const seek = () => {
    void run({ command: "seek", positionMs: position })
  }

  const disconnect = async () => {
    tokenClient.invalidate()
    await fetch("/api/spotify/disconnect", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store"
    }).catch(() => undefined)
    setConnected(false)
    setActive(false)
    setState(null)
    setPosition(0)
    setAuthResult(null)
    setAuthInProgress(false)
    setStatus("disconnected")
    setMessage("Spotify disconnected from Switchback.")
  }

  const beginAuthorization = () => {
    acceptedAuthorizationRef.current = null
    clearSavedSpotifyAuthorizationResult()
    setAuthResult(null)
    setAuthInProgress(true)
    setMessage("Finish sign-in in Spotify, then return here.")
  }

  const beginMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (rideMode) return
    const dock = event.currentTarget.closest("aside")
    if (!dock) return
    event.preventDefault()
    const bounds = dock.getBoundingClientRect()
    const offset = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    const move = (pointerEvent: PointerEvent) => {
      const width = Math.max(1, dock.getBoundingClientRect().width)
      const height = Math.max(1, dock.getBoundingClientRect().height)
      setDockPosition({
        left: Math.round(Math.max(8, Math.min(window.innerWidth - width - 8, pointerEvent.clientX - offset.x))),
        top: Math.round(Math.max(8, Math.min(window.innerHeight - height - 8, pointerEvent.clientY - offset.y)))
      })
    }
    const finish = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
      dragCleanupRef.current = null
    }
    dragCleanupRef.current = finish
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
  }

  const dockStyle = dockPosition && !rideMode
    ? { left: `${dockPosition.left}px`, top: `${dockPosition.top}px`, right: "auto", bottom: "auto" }
    : undefined

  if (hidden && !rideMode) {
    return (
      <button type="button" className={styles.reveal} aria-label="Show Spotify player" onClick={() => setHidden(false)}>
        <MusicNotes weight="fill" aria-hidden="true" />
        Music
      </button>
    )
  }

  if (status === "disconnected" || status === "premium" || (status === "error" && !connected)) {
    if (rideMode) return null
    return (
      <aside
        className={`${styles.prompt} ${styles.compactPrompt} ${rideMode ? styles.rideMode : ""}`}
        style={dockStyle}
        data-layout={rideMode ? "ride-rail" : "map-dock"}
        aria-label="Spotify player"
      >
        <span className={styles.promptIcon} aria-hidden="true">
          {status === "premium" ? <WarningCircle weight="fill" /> : <SpotifyLogo weight="fill" />}
        </span>
        <span className={styles.promptCopy}>
          <strong>{status === "premium" ? "Premium needed" : "Music for the road"}</strong>
          <small>{authInProgress ? "Finish sign-in in Spotify, then return here." : authOutcome ?? message}</small>
        </span>
        <div className={styles.promptActions}>
          {authInProgress ? (
            <button type="button" className={styles.recheck} onClick={recheckAuthorization}>Check sign-in</button>
          ) : null}
          <a
            className={styles.connect}
            href="/api/spotify/login?returnTo=%2F%3Fplayer%3Dopen"
            onClick={beginAuthorization}
          >
            {authInProgress ? "Spotify open" : authOutcome ? "Retry Spotify" : "Connect Spotify"}
          </a>
        </div>
      </aside>
    )
  }

  const summary = track
    ? `${artists(track)}${state?.device?.name ? ` · ${state.device.name}` : ""}`
    : active
      ? state?.device?.name ?? "Choose a track in Spotify"
      : NO_ACTIVE_DEVICE_MESSAGE

  return (
    <aside
      className={`${styles.player} ${compact ? styles.collapsed : ""} ${rideMode ? styles.rideMode : ""}`}
      style={dockStyle}
      data-layout={rideMode ? "ride-rail" : "map-dock"}
      aria-label="Spotify player"
    >
      <div className={styles.header} data-spotify-header>
        <div className={styles.cover}>
          {cover ? (
            <Image
              src={cover}
              alt={`${track?.album.name ?? "Spotify"} album cover`}
              width={72}
              height={72}
              unoptimized
            />
          ) : (
            <SpotifyLogo weight="fill" aria-hidden="true" />
          )}
        </div>

        <div className={styles.summary} aria-live="polite">
          <strong title={track?.name}>{track?.name ?? (status === "checking" ? "Checking Spotify" : "Spotify connected")}</strong>
          <span title={summary}>{summary}</span>
        </div>

        <button
          type="button"
          className={styles.primary}
          aria-label={`${state?.isPlaying ? "Pause" : "Play"} ${track?.name ?? "Spotify"}`}
          disabled={!controlsEnabled}
          onClick={() => void run({ command: state?.isPlaying ? "pause" : "play" })}
        >
          {state?.isPlaying ? <Pause weight="fill" aria-hidden="true" /> : <Play weight="fill" aria-hidden="true" />}
        </button>

        {!rideMode ? (
          <div className={styles.playerUtilities} data-spotify-utilities>
            <button
              type="button"
              className={styles.collapse}
              aria-label={collapsed ? "Expand music controls" : "Collapse music controls"}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? <CaretUp aria-hidden="true" /> : <CaretDown aria-hidden="true" />}
            </button>
            <button type="button" className={styles.utility} aria-label="Move Spotify player" onPointerDown={beginMove}>
              <DotsSixVertical weight="bold" aria-hidden="true" />
            </button>
            <button type="button" className={styles.utility} aria-label="Hide Spotify player" onClick={() => setHidden(true)}>
              <X weight="bold" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      {!compact ? (
        <div className={styles.detail}>
          <div className={styles.timeline}>
            <span>{clock(position)}</span>
            <input
              aria-label="Track position"
              type="range"
              min={0}
              max={Math.max(0, state?.duration ?? 0)}
              step={1000}
              value={Math.min(position, state?.duration ?? 0)}
              disabled={!state?.track || !controlsEnabled}
              onChange={(event) => setPosition(Number(event.currentTarget.value))}
              onPointerUp={seek}
              onTouchEnd={seek}
              onKeyUp={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) seek()
              }}
            />
            <span>-{clock(Math.max(0, (state?.duration ?? 0) - position))}</span>
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              aria-label="Previous track"
              disabled={!controlsEnabled}
              onClick={() => void run({ command: "previous" })}
            >
              <SkipBack weight="fill" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next track"
              disabled={!controlsEnabled}
              onClick={() => void run({ command: "next" })}
            >
              <SkipForward weight="fill" aria-hidden="true" />
            </button>
            <label className={styles.volume}>
              <SpeakerHigh aria-hidden="true" />
              <span className={styles.srOnly}>Spotify volume</span>
              <input
                aria-label="Spotify volume"
                type="range"
                min={0}
                max={100}
                value={volume}
                disabled={!volumeEnabled}
                onChange={(event) => {
                  const nextVolume = Number(event.currentTarget.value)
                  setVolume(nextVolume)
                  void run({ command: "volume", volumePercent: nextVolume })
                }}
              />
            </label>
            <button type="button" aria-label="Disconnect Spotify" onClick={() => void disconnect()}>
              <SignOut aria-hidden="true" />
            </button>
          </div>
          {!active ? (
            <a className={styles.openSpotify} href="https://open.spotify.com/" target="_blank" rel="noreferrer">
              Open Spotify
            </a>
          ) : null}
          {authOutcome ?? message ? <p className={styles.message} role="status">{authOutcome ?? message}</p> : null}
        </div>
      ) : null}
    </aside>
  )
}
