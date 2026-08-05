"use client"

import { Check, GpsFix, GpsSlash, Pause, Play, Record, Sparkle, X } from "@phosphor-icons/react"
import { useEffect } from "react"
import type { FreeRideSuggestion } from "@/lib/domain/contracts"
import { recordingTelemetry } from "@/lib/client/recording-session"
import type { RecordingSessionController } from "./useRecordingSession"

interface FreeRideHudProps {
  controller: RecordingSessionController
  suggestion: FreeRideSuggestion | null
  loading: boolean
  error: string | null
  suppressionReason?: "gps-uncertain" | "high-workload" | "cooldown" | "no-safe-candidate"
  onAccept(suggestion: FreeRideSuggestion): void
  onIgnore(): void
  onLessLikeThis(): void
  onExit(): void
}

function compassLabel(degrees: number | null): string {
  if (degrees == null || !Number.isFinite(degrees)) return "—"
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
  const normalized = ((degrees % 360) + 360) % 360
  return `${directions[Math.round(normalized / 45) % 8]} ${Math.round(normalized)}°`
}

function feet(meters: number | null): string {
  return meters == null ? "—" : String(Math.round(meters * 3.28084))
}

function suppressionLabel(reason: FreeRideHudProps["suppressionReason"]): string {
  switch (reason) {
    case "gps-uncertain":
      return "Waiting for a reliable GPS fix before offering a road."
    case "high-workload":
      return "Suggestions are paused while your riding workload is high."
    case "cooldown":
      return "Suggestion controls are cooling down. Keep your attention on the road."
    case "no-safe-candidate":
      return "No experimental road suggestion is ready in the next few miles."
    default:
      return "Keep riding; Switchback will look for an experimental road idea ahead."
  }
}

function formatScore(score: number): string {
  return Number.isFinite(score) ? `${Math.round(score)}/100` : "—"
}

/**
 * Full-screen Free Ride surface. It deliberately presents at most one
 * suggestion and keeps all decision controls large, explicit, and optional;
 * the rider can continue recording without accepting anything.
 */
export function FreeRideHud({
  controller,
  suggestion,
  loading,
  error,
  suppressionReason,
  onAccept,
  onIgnore,
  onLessLikeThis,
  onExit
}: FreeRideHudProps) {
  const { state, clock, pause, resume, finish } = controller
  const telemetry = recordingTelemetry(state, clock)
  const paused = state.status === "paused"
  const unavailable = state.status === "denied" || state.status === "error"
  const accuracy = telemetry.accuracyMeters

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

  return (
    <section className="ride-hud free-ride-hud" aria-label="Free Ride neural map">
      <header className="ride-topbar free-ride-topbar">
        <div className="ride-route-name">
          <span className="live-dot" aria-hidden="true" />
          <span>
            <small>Free Ride</small>
            <h1>Free Ride</h1>
            <strong>Experimental</strong>
          </span>
        </div>
        <div className="gps-status" role="status" aria-live="polite">
          {unavailable ? <GpsSlash aria-hidden="true" /> : <GpsFix aria-hidden="true" />}
          {unavailable ? "GPS unavailable" : accuracy == null ? "Waiting for GPS" : `GPS ${Math.round(accuracy)} m`}
        </div>
        <button type="button" className="ride-exit" aria-label="Exit Free Ride" onClick={onExit}>
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="free-ride-main">
        <div className="free-ride-speed" aria-label="Current speed">
          <strong>{unavailable ? "—" : Math.round(telemetry.currentSpeedMph ?? 0)}</strong>
          <span>mph</span>
        </div>
        <div className="free-ride-heading" aria-label="Current heading">
          <span>Heading</span>
          <strong>{compassLabel(telemetry.headingDegrees)}</strong>
        </div>
        <div className="free-ride-instruction" role="status" aria-live="polite">
          <Sparkle weight="fill" aria-hidden="true" />
          <span>{paused ? "Recording paused" : "Ride your way"}</span>
        </div>
      </div>

      {suggestion ? (
        <section className="free-ride-suggestion" aria-label="Suggested fun road">
          <div className="free-ride-suggestion-heading">
            <div>
              <span className="eyebrow">Experimental road idea ahead</span>
              <h2>{suggestion.title}</h2>
            </div>
            <strong className="free-ride-score" aria-label={`Suggestion score ${formatScore(suggestion.score.total)}`}>
              {formatScore(suggestion.score.total)}
            </strong>
          </div>
          <ul>
            {suggestion.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <div className="free-ride-suggestion-actions">
            <button type="button" className="free-ride-accept" onClick={() => onAccept(suggestion)}>
              <NavigationIcon />
              Accept suggestion
            </button>
            <button type="button" onClick={onIgnore}>Ignore suggestion</button>
            <button type="button" onClick={onLessLikeThis}>Less like this</button>
          </div>
        </section>
      ) : (
        <div className="free-ride-empty" role={error ? "alert" : "status"} aria-live="polite">
          {error ? <strong>{error}</strong> : null}
          {!error && loading ? <strong>Looking for a road idea ahead…</strong> : null}
          {!error && !loading ? <strong>{suppressionLabel(suppressionReason)}</strong> : null}
          <span>Experimental suggestion: ride at your own judgment; it is not verified route guidance.</span>
        </div>
      )}

      <footer className="ride-telemetry free-ride-telemetry">
        <div><strong>{telemetry.distanceMiles.toFixed(1)}</strong><span>miles ridden</span></div>
        <div><strong>{telemetry.averageSpeedMph == null ? "—" : telemetry.averageSpeedMph.toFixed(1)}</strong><span>avg mph</span></div>
        <div><strong>{feet(telemetry.currentAltitudeMeters)}</strong><span>feet elevation</span></div>
        <div><strong>{telemetry.headingDegrees == null ? "—" : compassLabel(telemetry.headingDegrees)}</strong><span>heading</span></div>
      </footer>

      {state.error ? <div className="recording-error" role="alert">{state.error}</div> : null}

      <div className="recording-controls free-ride-controls" aria-label="Free Ride controls">
        {paused ? (
          <button type="button" className="recording-resume" onClick={resume}>
            <Play weight="fill" aria-hidden="true" /> Resume
          </button>
        ) : (
          <button type="button" className="recording-pause" onClick={pause} disabled={unavailable}>
            <Pause weight="fill" aria-hidden="true" /> Pause
          </button>
        )}
        <button type="button" className="recording-finish" onClick={finish}>
          <Check weight="bold" aria-hidden="true" /> Finish &amp; save
        </button>
        <button type="button" className="recording-discard" onClick={onExit}>
          <Record weight="fill" aria-hidden="true" /> Exit
        </button>
      </div>
    </section>
  )
}

function NavigationIcon() {
  return <span aria-hidden="true">↗</span>
}
