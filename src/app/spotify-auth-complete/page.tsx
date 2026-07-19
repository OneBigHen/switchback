"use client"

import Link from "next/link"
import { useEffect, useSyncExternalStore } from "react"
import {
  SPOTIFY_AUTH_CHANNEL,
  SPOTIFY_AUTH_STORAGE_KEY,
  isSpotifyAuthResult,
  spotifyAuthOutcomeMessage,
  type SpotifyAuthNotification,
  type SpotifyAuthResult
} from "@/lib/spotify/auth-outcome"
import styles from "./SpotifyAuthComplete.module.css"

function callbackResult(): SpotifyAuthResult {
  const value = new URLSearchParams(window.location.search).get("spotify")
  return isSpotifyAuthResult(value) ? value : "connection_failed"
}

function subscribeToCallbackResult(): () => void {
  return () => undefined
}

function serverCallbackResult(): null {
  return null
}

function publish(result: SpotifyAuthResult): void {
  const notification: SpotifyAuthNotification = {
    type: SPOTIFY_AUTH_CHANNEL,
    result
  }
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(SPOTIFY_AUTH_CHANNEL)
    channel.postMessage(notification)
    channel.close()
  }
  try {
    window.localStorage.setItem(SPOTIFY_AUTH_STORAGE_KEY, JSON.stringify(notification))
  } catch {
    // Storage can be unavailable in private browsing; BroadcastChannel remains enough.
  }
}

export default function SpotifyAuthCompletePage() {
  const result = useSyncExternalStore(
    subscribeToCallbackResult,
    callbackResult,
    serverCallbackResult
  )
  const message = result
    ? spotifyAuthOutcomeMessage(result) ?? "Spotify could not finish sign-in."
    : "Finishing the Spotify connection..."

  useEffect(() => {
    if (!result) return
    publish(result)
    if (result !== "connected") return
    const closeTimer = window.setTimeout(() => window.close(), 600)
    return () => window.clearTimeout(closeTimer)
  }, [result])

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite">
        <p className={styles.kicker}>Switchback music</p>
        <h1>{result === "connected" ? "Spotify connected" : result ? "Spotify needs attention" : "Finishing sign-in"}</h1>
        <p>{message}</p>
        <Link className={styles.returnLink} href="/">Return to Switchback</Link>
      </section>
    </main>
  )
}
