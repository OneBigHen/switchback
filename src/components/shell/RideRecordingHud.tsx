"use client"

import { Check, GpsSlash, Pause, Play, Record, X } from "@phosphor-icons/react"
import { useEffect } from "react"
import { recordingTelemetry } from "@/lib/client/recording-session"
import type { RecordingSessionController } from "./useRecordingSession"

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}

function compassLabel(degrees: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
  const index = Math.round(((degrees % 360) + 360) % 360 / 45) % 8
  return `${directions[index]} ${Math.round(degrees % 360)}°`
}

function feet(meters: number | null): string {
  return meters == null ? "—" : String(Math.round(meters * 3.28084))
}

function elevationSparkline(altitudes: Array<number | null | undefined>): string | null {
  const values = altitudes.filter((value): value is number =>
    value != null && Number.isFinite(value)
  )
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(1, max - min)
  const width = 320
  const height = 72
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * (width - 4) + 2
      const y = height - 4 - ((value - min) / range) * (height - 8)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
}

interface RideRecordingHudProps {
  controller: RecordingSessionController
  /** Runs when the rider discards the recording (defaults to just discarding). */
  onDiscard?: () => void
}

/**
 * Full-screen riding HUD for a passive recording session. Mirrors the
 * navigation HUD's look (big speed, telemetry footer over the full-screen
 * ride map) and adds elevation/heading/accuracy readouts and an elevation
 * profile so the rider can glance at the app while riding and see everything
 * that matters.
 */
export function RideRecordingHud({ controller, onDiscard }: RideRecordingHudProps) {
  const { state, clock, elapsedMillis, pause, resume, finish } = controller
  const discard = onDiscard ?? controller.discard
  const telemetry = recordingTelemetry(state, clock)
  const paused = state.status === "paused"
  const denied = state.status === "denied"
  const error = state.status === "error"

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const rootWasLocked = root.classList.contains("ride-mode-active")
    const bodyWasLocked = body.classList.contains("ride-mode-active")
    root.classList.add("ride-mode-active")
    body.classList.add("ride-mode-active")
    return () => {
      if (!rootWasLocked) root.classList.remove("ride-mode-active")
      if (!bodyWasLocked) body.classList.remove("ride-mode-active")
    }
  }, [])

  const sparkline = elevationSparkline(state.points.map((point) => point.altitudeMeters))
  const speed = telemetry.currentSpeedMph == null ? 0 : Math.round(telemetry.currentSpeedMph)
  const heading = telemetry.headingDegrees == null
    ? null
    : compassLabel(telemetry.headingDegrees)

  return (
    <section className="ride-hud recording-ride-hud" aria-label="Ride recording HUD">
      <header>
        <div className="recording-title">
          <span className="recording-kicker">
            <Record weight="fill" aria-hidden="true" />
            {paused ? "Recording paused" : denied ? "GPS permission needed" : error ? "GPS error" : "Recording locally"}
          </span>
          <strong>{formatDuration(elapsedMillis)}</strong>
        </div>
        <button
          type="button"
          className="ride-exit"
          aria-label="Finish recording"
          onClick={finish}
        >
          <Check weight="bold" aria-hidden="true" />
        </button>
      </header>

      <div className="recording-main" role="status" aria-live="off">
        <div className="ride-speed-badge recording-speed">
          <strong>{denied || error ? "—" : speed}</strong>
          <span>mph</span>
        </div>
        <div className="recording-altitude">
          <strong>{feet(telemetry.currentAltitudeMeters)}</strong>
          <span>ft elevation</span>
          <div className="recording-gain" aria-label="Elevation gain and loss">
            <span className="recording-gain-up">▲ {feet(telemetry.ascentMeters)}</span>
            <span className="recording-gain-down">▼ {feet(telemetry.descentMeters)}</span>
          </div>
        </div>
        {sparkline ? (
          <svg
            className="recording-elevation"
            viewBox="0 0 320 72"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline points={sparkline} />
          </svg>
        ) : (
          <div className="recording-elevation-empty">
            <GpsSlash weight="bold" aria-hidden="true" />
            <span>Elevation profile appears after altitude fixes arrive.</span>
          </div>
        )}
      </div>

      {state.error ? (
        <div className="recording-error" role="alert">
          {state.error}
        </div>
      ) : null}

      <footer className="ride-telemetry">
        <div>
          <strong>{telemetry.distanceMiles.toFixed(1)}</strong>
          <span>miles ridden</span>
        </div>
        <div>
          <strong>{telemetry.averageSpeedMph == null ? "—" : telemetry.averageSpeedMph.toFixed(1)}</strong>
          <span>avg mph</span>
        </div>
        <div>
          <strong>{telemetry.maxSpeedMph == null ? "—" : Math.round(telemetry.maxSpeedMph)}</strong>
          <span>max mph</span>
        </div>
        <div>
          <strong>{heading ?? "—"}</strong>
          <span>heading</span>
        </div>
        <div>
          <strong>{telemetry.accuracyMeters == null ? "—" : `${Math.round(telemetry.accuracyMeters)} m`}</strong>
          <span>GPS accuracy</span>
        </div>
      </footer>

      <div className="recording-controls" aria-label="Recording controls">
        {paused ? (
          <button type="button" className="recording-resume" onClick={resume}>
            <Play weight="fill" aria-hidden="true" />
            Resume
          </button>
        ) : (
          <button type="button" className="recording-pause" onClick={pause} disabled={denied || error}>
            <Pause weight="fill" aria-hidden="true" />
            Pause
          </button>
        )}
        <button type="button" className="recording-finish" onClick={finish}>
          <Check weight="bold" aria-hidden="true" />
          Finish &amp; save
        </button>
        <button type="button" className="recording-discard" onClick={discard}>
          <X weight="bold" aria-hidden="true" />
          Discard
        </button>
      </div>
    </section>
  )
}
