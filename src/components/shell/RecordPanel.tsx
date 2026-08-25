"use client"

import { MapPin, Pause, Play, Record, Stop } from "@phosphor-icons/react"
import { useMemo } from "react"
import { recordingTelemetry } from "@/lib/client/recording-session"
import type { RecordingSessionController } from "./useRecordingSession"

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}

/** Bounding-box-normalized breadcrumb path from real recorded coordinates
 * (matches the projection `CommunityPreviewMap` uses for published routes) —
 * this used to be a synthetic index-based zigzag unrelated to the ride. */
function breadcrumbPoints(coordinates: Array<readonly [number, number]>, width: number, height: number): string {
  const longitudes = coordinates.map(([longitude]) => longitude)
  const latitudes = coordinates.map(([, latitude]) => latitude)
  const minLongitude = Math.min(...longitudes)
  const maxLongitude = Math.max(...longitudes)
  const minLatitude = Math.min(...latitudes)
  const maxLatitude = Math.max(...latitudes)
  const longitudeSpan = Math.max(0.000001, maxLongitude - minLongitude)
  const latitudeSpan = Math.max(0.000001, maxLatitude - minLatitude)
  return coordinates.map(([longitude, latitude]) => {
    const x = 12 + ((longitude - minLongitude) / longitudeSpan) * (width - 24)
    const y = 12 + ((maxLatitude - latitude) / latitudeSpan) * (height - 24)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(" ")
}

interface RecordPanelProps {
  controller: RecordingSessionController
}

export function RecordPanel({ controller }: RecordPanelProps) {
  const { state, clock, start, pause, resume, finish } = controller
  const telemetry = useMemo(() => recordingTelemetry(state, clock), [state, clock])
  const miles = telemetry.distanceMiles
  const latestSpeed = telemetry.currentSpeedMph ?? 0

  return (
    <section className="destination-panel record-panel" aria-labelledby="record-title">
      <header>
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
            <polyline points={breadcrumbPoints(state.points.map((point) => point.coordinate), 320, 140)} />
          </svg>
        ) : <span>Breadcrumb map appears after GPS points arrive.</span>}
      </div>

      <dl className="record-telemetry">
        <div><dt>Distance</dt><dd>{miles.toFixed(1)} mi</dd></div>
        <div><dt>Duration</dt><dd>{formatDuration(telemetry.elapsedMillis)}</dd></div>
        <div><dt>Speed</dt><dd>{latestSpeed.toFixed(0)} mph</dd></div>
      </dl>

      <div className="record-actions">
        {state.status === "idle" || state.status === "ready" || state.status === "finished" || state.status === "error" || state.status === "denied" ? (
          <button type="button" className="primary-commit" onClick={start}><Record weight="fill" aria-hidden="true" /> Start recording</button>
        ) : null}
        {state.status === "recording" ? (
          <button type="button" onClick={pause}><Pause weight="fill" aria-hidden="true" /> Pause recording</button>
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
