"use client"

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import {
  activeRecordingMillis,
  createRecordingState,
  recordingSessionReducer,
  type RecordingSessionSnapshot,
  type RecordingSessionState
} from "@/lib/client/recording-session"
import { trackRuntimeResource } from "@/lib/client/runtime-diagnostics"
import type { RecordedRidePoint } from "@/lib/storage/ride-journal"

const RECOVERY_KEY = "switchback:active-recording"

function recoverySnapshot(state: RecordingSessionState): RecordingSessionSnapshot {
  return {
    status: state.status,
    startedAt: state.startedAt,
    pausedAt: state.pausedAt,
    pausedMillis: state.pausedMillis,
    endedAt: state.endedAt,
    points: state.points
  }
}

/**
 * One recording session shared by the Record tab panel and the full-screen
 * riding HUD. Owns the GPS watcher, crash recovery (an interrupted recording
 * is restored from localStorage so reopening the app can drop straight back
 * into riding mode), and the elapsed-time clock.
 */
export function useRecordingSession() {
  const [state, dispatch] = useReducer(recordingSessionReducer, undefined, createRecordingState)
  const [clock, setClock] = useState(() => Date.now())
  const watchIdRef = useRef<number | null>(null)
  const releaseWatchMetricRef = useRef<(() => void) | null>(null)

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    watchIdRef.current = null
    releaseWatchMetricRef.current?.()
    releaseWatchMetricRef.current = null
  }, [])

  const watch = useCallback((): boolean => {
    if (!navigator.geolocation) {
      dispatch({ type: "error", message: "GPS is not available in this browser." })
      return false
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => dispatch({
        type: "sample",
        point: {
          coordinate: [position.coords.longitude, position.coords.latitude],
          recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
          speedMph: position.coords.speed == null ? null : position.coords.speed * 2.236936,
          altitudeMeters: position.coords.altitude == null ? null : position.coords.altitude,
          headingDegrees: position.coords.heading == null ? null : position.coords.heading,
          accuracyMeters: position.coords.accuracy == null ? null : position.coords.accuracy
        }
      }),
      (error) => dispatch({
        type: error.code === error.PERMISSION_DENIED ? "permission_denied" : "error",
        message: error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Enable precise location for Switchback and try again."
          : `GPS is not ready: ${error.message}`
      }),
      { enableHighAccuracy: true, maximumAge: 1_000, timeout: 12_000 }
    )
    releaseWatchMetricRef.current = trackRuntimeResource("gps-watch")
    return true
  }, [])

  // Restore an interrupted recording on mount.
  useEffect(() => {
    const raw = localStorage.getItem(RECOVERY_KEY)
    if (!raw) return
    try {
      dispatch({ type: "recover", snapshot: JSON.parse(raw) as RecordingSessionSnapshot })
    } catch {
      localStorage.removeItem(RECOVERY_KEY)
    }
  }, [])

  // Persist an in-progress recording so a reload can resume it.
  useEffect(() => {
    if (state.status === "recording" || state.status === "paused") {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(recoverySnapshot(state)))
    } else if (state.status === "finished" || state.status === "idle") {
      localStorage.removeItem(RECOVERY_KEY)
    }
  }, [state])

  // Tick the elapsed-time clock once per second while recording.
  useEffect(() => {
    if (state.status !== "recording") return
    const releaseTimerMetric = trackRuntimeResource("timer")
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => {
      window.clearInterval(timer)
      releaseTimerMetric()
    }
  }, [state.status])

  useEffect(() => stopWatch, [stopWatch])

  const start = useCallback(() => {
    dispatch({ type: "start", at: Date.now() })
    watch()
  }, [watch])

  const pause = useCallback(() => {
    stopWatch()
    dispatch({ type: "pause", at: Date.now() })
  }, [stopWatch])

  const resume = useCallback(() => {
    dispatch({ type: "resume", at: Date.now() })
    watch()
  }, [watch])

  const finish = useCallback(() => {
    stopWatch()
    dispatch({ type: "finish", at: Date.now() })
  }, [stopWatch])

  const discard = useCallback(() => {
    stopWatch()
    dispatch({ type: "reset" })
  }, [stopWatch])

  const isActive = state.status === "recording" || state.status === "paused"

  return {
    state,
    clock,
    elapsedMillis: activeRecordingMillis(state, clock),
    isActive,
    start,
    pause,
    resume,
    finish,
    discard
  }
}

export type RecordingSessionController = ReturnType<typeof useRecordingSession>
export { RECOVERY_KEY }
export type { RecordedRidePoint }
