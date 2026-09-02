"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { NearMeAnchor } from "./geo"

/**
 * Client-side "rides near me" primitive: a cached geolocation anchor and a
 * one-shot request on mount. The distance maths live in `./geo` so server
 * components can share them.
 */

export type { NearMeAnchor } from "./geo"
export { haversineMiles, centerOfBbox, centerOfPath, milesFromAnchor, formatAway } from "./geo"

export type NearMeStatus = "idle" | "locating" | "granted" | "denied" | "unavailable"

const STORAGE_KEY = "sb.nearme.anchor"
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }

function readCached(): NearMeAnchor | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== "object" || parsed === null ||
      typeof (parsed as NearMeAnchor).lat !== "number" ||
      typeof (parsed as NearMeAnchor).lon !== "number" ||
      typeof (parsed as NearMeAnchor).at !== "number"
    ) return null
    const anchor = parsed as NearMeAnchor
    if (!Number.isFinite(anchor.lat) || !Number.isFinite(anchor.lon)) return null
    if (Date.now() - anchor.at > MAX_AGE_MS) return null
    return anchor
  } catch {
    return null
  }
}

function writeCached(anchor: NearMeAnchor): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(anchor))
  } catch {
    /* private mode / storage disabled — the anchor just won't persist. */
  }
}

export interface UseNearMe {
  readonly anchor: NearMeAnchor | null
  readonly status: NearMeStatus
  /** True once a usable fix exists and the browser has not since revoked it. */
  readonly located: boolean
  /** Re-request the browser location (event-handler safe). */
  requestLocation(): void
}

/**
 * Adopts the last known spot immediately, then refreshes it once on mount.
 * State only moves through async callbacks / a microtask so a client render
 * still matches the server on first paint.
 */
export function useNearMe(): UseNearMe {
  const [anchor, setAnchor] = useState<NearMeAnchor | null>(null)
  const [status, setStatus] = useState<NearMeStatus>("idle")
  const bootDone = useRef(false)

  const adopt = useCallback((next: NearMeAnchor, persist: boolean) => {
    setAnchor(next)
    if (persist) writeCached(next)
    setStatus("granted")
  }, [])

  const onSuccess = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude } = position.coords
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      adopt({ lat: latitude, lon: longitude, at: Date.now() }, true)
    }
  }, [adopt])

  const onError = useCallback((error: GeolocationPositionError) => {
    setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable")
  }, [])

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unavailable")
      return
    }
    setStatus("locating")
    navigator.geolocation.getCurrentPosition(onSuccess, onError, GEO_OPTIONS)
  }, [onSuccess, onError])

  useEffect(() => {
    if (bootDone.current) return
    bootDone.current = true
    const cached = readCached()
    if (cached) queueMicrotask(() => adopt(cached, false))
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, GEO_OPTIONS)
    } else if (!cached) {
      queueMicrotask(() => setStatus("unavailable"))
    }
  }, [adopt, onSuccess, onError])

  return {
    anchor,
    status,
    located: status === "granted" && anchor !== null,
    requestLocation
  }
}
