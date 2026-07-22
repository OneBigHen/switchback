"use client"

import { MapPin, Pause, Play, Record, Stop } from "@phosphor-icons/react"
import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import {
  activeRecordingMillis,
  createRecordingState,
  recordingSessionReducer,
  type RecordingSessionSnapshot
} from "@/lib/client/recording-session"
import type { RecordedRidePoint } from "@/lib/storage/ride-journal"

const RECOVERY_KEY = "switchback:active-recording"

function distanceMiles(points: RecordedRidePoint[]): number {
  const radians = (value: number) => value * Math.PI / 180
  let meters = 0
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1]!.coordinate
    const current = points[index]!.coordinate
    const latitudeDelta = radians(current[1] - previous[1])
    const longitudeDelta = radians(current[0] - previous[0])
    const firstLatitude = radians(previous[1])
    const secondLatitude = radians(current[1])
    const a = Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
    meters += 2 * 6_371_000 * Math.asin(Math.sqrt(a))
  }
  return meters / 1609.344
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}

interface RecordPanelProps {
  onFinish(points: RecordedRidePoint[]): void | Promise<void>
}

export function RecordPanel({ onFinish }: RecordPanelProps) {
  const [state, dispatch] = useReducer(recordingSessionReducer, undefined, createRecordingState)
  const [clock, setClock] = useState(() => Date.now())
  const watchId = useRef<number | null>(null)

  const stopWatch = () => {
    if (watchId.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current)
    }
    watchId.current = null
  }

  const watch = () => {
    if (!navigator.geolocation) {
      dispatch({ type: "error", message: "GPS is not available in this browser." })
      return false
    }
    watchId.current = navigator.geolocation.watchPosition(
      (position) => dispatch({
        type: "sample",
        point: {
          coordinate: [position.coords.longitude, position.coords.latitude],
          recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
          speedMph: position.coords.speed == null ? null : position.coords.speed * 2.236936
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
    return true
  }

  useEffect(() => {
    const raw = localStorage.getItem(RECOVERY_KEY)
    if (!raw) return
    try {
      dispatch({ type: "recover", snapshot: JSON.parse(raw) as RecordingSessionSnapshot })
    } catch {
      localStorage.removeItem(RECOVERY_KEY)
    }
  }, [])

  useEffect(() => {
    if (state.status === "recording" || state.status === "paused") {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify({
        status: state.status,
        startedAt: state.startedAt,
        pausedAt: state.pausedAt,
        pausedMillis: state.pausedMillis,
        endedAt: state.endedAt,
        points: state.points
      } satisfies RecordingSessionSnapshot))
    } else if (state.status === "finished" || state.status === "idle") {
      localStorage.removeItem(RECOVERY_KEY)
    }
  }, [state])

  useEffect(() => {
    if (state.status !== "recording") return
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [state.status])

  useEffect(() => () => stopWatch(), [])

  const miles = useMemo(() => distanceMiles(state.points), [state.points])
  const latestSpeed = state.points.at(-1)?.speedMph ?? 0

  const start = () => {
    dispatch({ type: "start", at: Date.now() })
    watch()
  }

  const resume = () => {
    dispatch({ type: "resume", at: Date.now() })
    watch()
  }

  const finish = () => {
    stopWatch()
    dispatch({ type: "finish", at: Date.now() })
    void onFinish(state.points)
  }

  return (
    <section className="destination-panel record-panel" aria-labelledby="record-title">
      <header>
        <span className="destination-kicker">Private by default</span>
        <h1 id="record-title">Record a ride</h1>
        <p>Capture a breadcrumb ride locally. Nothing leaves this device.</p>
      </header>

      <div className="record-readiness" role="status">
        <span className={`record-pulse is-${state.status}`} aria-hidden="true" />
        <div>
          <strong>{state.status === "recording" ? "Recording locally" : state.status === "paused" ? "Recording paused" : state.status === "denied" ? "GPS permission needed" : "Ready when you are"}</strong>
          <small>{state.error ?? `${state.points.length} GPS point${state.points.length === 1 ? "" : "s"} captured`}</small>
        </div>
      </div>

      <div className="record-map" aria-label="Recorded breadcrumb map">
        <MapPin weight="fill" aria-hidden="true" />
        {state.points.length > 1 ? (
          <svg viewBox="0 0 320 140" role="img" aria-label="Recorded breadcrumb preview">
            <polyline points={state.points.map((_, index) => `${20 + index * Math.min(28, 280 / state.points.length)},${110 - (index % 4) * 22}`).join(" ")} />
          </svg>
        ) : <span>Breadcrumb map appears after GPS points arrive.</span>}
      </div>

      <dl className="record-telemetry">
        <div><dt>Distance</dt><dd>{miles.toFixed(1)} mi</dd></div>
        <div><dt>Duration</dt><dd>{formatDuration(activeRecordingMillis(state, clock))}</dd></div>
        <div><dt>Speed</dt><dd>{latestSpeed.toFixed(0)} mph</dd></div>
      </dl>

      <div className="record-actions">
        {state.status === "idle" || state.status === "ready" || state.status === "finished" || state.status === "error" || state.status === "denied" ? (
          <button type="button" className="primary-commit" onClick={start}><Record weight="fill" aria-hidden="true" /> Start recording</button>
        ) : null}
        {state.status === "recording" ? (
          <button type="button" onClick={() => { stopWatch(); dispatch({ type: "pause", at: Date.now() }) }}><Pause weight="fill" aria-hidden="true" /> Pause recording</button>
        ) : null}
        {state.status === "paused" ? (
          <button type="button" className="primary-commit" onClick={resume}><Play weight="fill" aria-hidden="true" /> {state.startedAt ? "Resume recovered recording" : "Resume recording"}</button>
        ) : null}
        {state.status === "recording" || state.status === "paused" ? (
          <button type="button" onClick={finish}><Stop weight="fill" aria-hidden="true" /> Finish</button>
        ) : null}
      </div>
    </section>
  )
}
