"use client"

import { useEffect, useMemo, useRef } from "react"
import type { ExplorationSegment, ReconTrack } from "@/features/recon/types"
import type { ExplorationResult } from "@/features/recon/intel/exploration"
import { statusAt } from "@/features/recon/intel/exploration"
import type { XRayReport } from "@/features/recon/intel/xray"
import { RECON_CAMERA_MODES } from "@/features/recon/replay/camera-director"
import { REPLAY_RATES, playbackDurationMs, type EngineState, type ReplayEngine } from "@/features/recon/replay/replay-engine"
import { progressAtDistance, progressAtTimestamp } from "@/features/recon/replay/replay-timeline"
import { clock, feet, miles, timeOfDay } from "./recon-format"

interface ReplayControlsProps {
  engine: ReplayEngine
  state: EngineState
  track: ReconTrack
  xray: XRayReport | null
  segments: readonly ExplorationSegment[] | null
  exploration: ExplorationResult | null
}

/**
 * The live readout and the playback dock. Frame-rate values (clock, speed,
 * scrubber) are written straight to DOM nodes from the engine's frame
 * callback; React only re-renders on rare state changes.
 */
export default function ReplayControls({ engine, state, track, xray, segments, exploration }: ReplayControlsProps) {
  const recorded = track.playbackKind === "recorded"
  const speedRef = useRef<HTMLSpanElement>(null)
  const elapsedRef = useRef<HTMLElement>(null)
  const distanceRef = useRef<HTMLElement>(null)
  const altitudeRef = useRef<HTMLElement>(null)
  const wallClockRef = useRef<HTMLElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const scrubberRef = useRef<HTMLInputElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)
  const totalMs = playbackDurationMs(track)

  useEffect(() => {
    let lastText = ""
    return engine.onFrame(({ frame }) => {
      const set = (ref: { current: HTMLElement | null }, text: string) => {
        if (ref.current && ref.current.textContent !== text) ref.current.textContent = text
      }
      set(distanceRef, miles(frame.distanceMeters))
      set(altitudeRef, feet(frame.altitudeMeters))
      if (recorded) {
        set(speedRef, frame.speedMph === null ? "—" : String(Math.round(frame.speedMph)))
        set(elapsedRef, clock(frame.elapsedMs))
        set(wallClockRef, timeOfDay(track.startedAt === null || frame.elapsedMs === null ? null : track.startedAt + frame.elapsedMs))
      }
      if (segments) {
        const status = statusAt(segments, frame.distanceMeters)
        const text = status === "previously-ridden" ? "Ridden before" : status === "new-to-you" ? "New to you" : ""
        if (text !== lastText && statusRef.current) {
          lastText = text
          statusRef.current.textContent = text
          statusRef.current.dataset.status = status ?? ""
        }
      }
      const percent = frame.progress * 100
      if (scrubberRef.current && !scrubbing.current) {
        scrubberRef.current.value = String(Math.round(frame.progress * 1000))
        scrubberRef.current.setAttribute("aria-valuetext", recorded ? `${clock(frame.elapsedMs)} of ${clock(totalMs)}` : `${miles(frame.distanceMeters)} of ${miles(track.distanceMeters)}`)
      }
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${percent / 100})`
    })
  }, [engine, track, segments, recorded, totalMs])

  // The scrubber runs on playback progress (time for rides), so distance-based
  // facts are projected onto that axis before drawing.
  const silhouette = useMemo(() => (xray ? elevationPath(xray, track) : null), [xray, track])
  const newBands = useMemo(
    () =>
      (segments ?? [])
        .filter((segment) => segment.status === "new-to-you")
        .map((segment) => {
          const from = progressAtDistance(track, segment.fromMeters)
          return { x: from * 1000, width: Math.max(1.5, (progressAtDistance(track, segment.toMeters) - from) * 1000) }
        }),
    [segments, track]
  )
  const momentMarks = useMemo(() => track.moments.map((moment) => ({ id: moment.id, caption: moment.caption, x: progressAtTimestamp(track, moment.at) * 1000 })), [track])

  return (
    <>
      <section className="recon-readout recon-glass" aria-label="Live ride readout">
        {recorded ? (
          <div className="recon-readout-primary">
            <span className="recon-readout-big" ref={speedRef}>
              —
            </span>
            <span className="recon-readout-unit">mph</span>
          </div>
        ) : null}
        <dl className="recon-readout-grid">
          {recorded ? (
            <div>
              <dt>Elapsed</dt>
              <dd ref={elapsedRef}>0:00</dd>
            </div>
          ) : null}
          <div>
            <dt>Distance</dt>
            <dd ref={distanceRef}>0.0 mi</dd>
          </div>
          <div>
            <dt>Elevation</dt>
            <dd ref={altitudeRef}>—</dd>
          </div>
          {recorded ? (
            <div>
              <dt>Clock</dt>
              <dd ref={wallClockRef}>—</dd>
            </div>
          ) : null}
        </dl>
        {segments ? <p className="recon-status" ref={statusRef} aria-live="off" /> : null}
        {!recorded ? <p className="recon-quiet">Route preview: distance only — no recorded time or speed.</p> : null}
      </section>

      {!state.following ? (
        <button type="button" className="recon-chip recon-glass recon-resume" onClick={() => engine.resumeFollow()}>
          ◎ Resume follow
        </button>
      ) : null}

      <section className="recon-dock recon-glass" aria-label="Playback">
        <div className="recon-dock-row">
          <button type="button" className="recon-play" onClick={() => engine.toggle()} aria-label={state.playing ? "Pause" : state.finished ? "Replay from start" : "Play"}>
            {state.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <div className="recon-scrub">
            <svg className="recon-scrub-art" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
              {silhouette ? <path className="recon-scrub-elevation" d={silhouette} /> : null}
              {newBands.map((band, index) => (
                <rect key={index} className="recon-scrub-new" x={band.x} width={band.width} y={36} height={4} />
              ))}
              {momentMarks.map((moment) => (
                <rect key={moment.id} className="recon-scrub-moment" x={moment.x - 1.5} width={3} y={0} height={40}>
                  <title>{moment.caption || "Photo"}</title>
                </rect>
              ))}
            </svg>
            <div className="recon-scrub-track" aria-hidden="true">
              <div className="recon-scrub-fill" ref={fillRef} />
            </div>
            <input
              ref={scrubberRef}
              className="recon-scrub-input"
              type="range"
              min={0}
              max={1000}
              step={1}
              defaultValue={0}
              aria-label={recorded ? "Ride time" : "Route distance"}
              onPointerDown={() => (scrubbing.current = true)}
              onPointerUp={() => (scrubbing.current = false)}
              onBlur={() => (scrubbing.current = false)}
              onInput={(event) => engine.seek(Number(event.currentTarget.value) / 1000)}
            />
          </div>
          <span className="recon-dock-total">{recorded ? clock(totalMs) : miles(track.distanceMeters)}</span>
        </div>
        <div className="recon-dock-row recon-dock-options">
          <div className="recon-segmented" role="group" aria-label={recorded ? "Playback speed" : "Flyover speed"}>
            {REPLAY_RATES.map((rate) => (
              <button key={rate} type="button" aria-pressed={state.rate === rate} onClick={() => engine.setRate(rate)}>
                {rate}×
              </button>
            ))}
          </div>
          <div className="recon-segmented" role="group" aria-label="Camera">
            {RECON_CAMERA_MODES.map((mode) => (
              <button key={mode.id} type="button" aria-pressed={state.mode === mode.id && state.following} onClick={() => engine.setMode(mode.id)}>
                {mode.label}
              </button>
            ))}
          </div>
          {exploration && recorded ? (
            <p className="recon-dock-fact">
              <span className="recon-ember-text">{miles(exploration.newToYouMeters)}</span> new to you
              {exploration.comparedRideCount === 0 ? " · first ride on record" : ` · vs ${exploration.comparedRideCount} earlier ${exploration.comparedRideCount === 1 ? "ride" : "rides"}`}
            </p>
          ) : null}
        </div>
      </section>
      <p className="recon-sr-only">Keyboard: space plays or pauses, arrow keys step, X opens road detail, C starts the film, 1 to 5 choose the camera.</p>
    </>
  )
}

/** Elevation silhouette on a 1000×40 box, over playback progress. */
function elevationPath(report: XRayReport, track: ReconTrack): string | null {
  if (!report.altitudeRange) return null
  const [low, high] = report.altitudeRange
  const span = Math.max(20, high - low)
  const points = report.bins.map((bin) => {
    const x = progressAtDistance(track, (bin.fromMeters + bin.toMeters) / 2) * 1000
    const y = bin.altitudeMeters === null ? 34 : 34 - ((bin.altitudeMeters - low) / span) * 30
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M0,34 L${points.join(" L")} L1000,34 Z`
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" fill="currentColor" />
    </svg>
  )
}
