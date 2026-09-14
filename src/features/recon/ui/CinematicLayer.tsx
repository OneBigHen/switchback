"use client"

import { useEffect, useRef } from "react"
import type { ReconTrack } from "@/features/recon/types"
import type { ExplorationResult } from "@/features/recon/intel/exploration"
import type { XRayReport } from "@/features/recon/intel/xray"
import type { EngineState, ReplayEngine } from "@/features/recon/replay/replay-engine"
import { clock, duration, feet, miles, rideDate } from "./recon-format"

interface CinematicLayerProps {
  engine: ReplayEngine
  state: EngineState
  track: ReconTrack
  xray: XRayReport | null
  exploration: ExplorationResult | null
}

/**
 * The film's chrome: letterbox, a title card over the establishing shot, a
 * quiet lower third while riding, and an end card. Frame-rate values are
 * written to the DOM directly; the rest of the UI steps out of the way.
 */
export default function CinematicLayer({ engine, state, track, xray, exploration }: CinematicLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const mileRef = useRef<HTMLSpanElement>(null)
  const altitudeRef = useRef<HTMLSpanElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const recorded = track.playbackKind === "recorded"
  const exitRef = useRef<HTMLButtonElement>(null)

  useEffect(() => exitRef.current?.focus(), [])

  useEffect(
    () =>
      engine.onFrame(({ frame, cinematic }) => {
        if (!cinematic || !rootRef.current) return
        const phase = cinematic.shot === "establish" || cinematic.shot === "dive" ? "title" : cinematic.shot === "pullaway" || cinematic.shot === "orbit" ? "outro" : "ride"
        if (rootRef.current.dataset.phase !== phase) rootRef.current.dataset.phase = phase
        const set = (element: HTMLElement | null, text: string) => {
          if (element && element.textContent !== text) element.textContent = text
        }
        set(mileRef.current, miles(frame.distanceMeters))
        set(altitudeRef.current, feet(frame.altitudeMeters))
        if (recorded) set(timeRef.current, clock(frame.elapsedMs))
        if (progressRef.current) progressRef.current.style.transform = `scaleX(${(cinematic.seconds / cinematic.totalSeconds).toFixed(4)})`
      }),
    [engine, recorded]
  )

  return (
    <div className="recon-film" ref={rootRef} data-phase="title">
      <div className="recon-letterbox recon-letterbox-top" aria-hidden="true" />
      <div className="recon-letterbox recon-letterbox-bottom" aria-hidden="true" />
      <div className="recon-grade" aria-hidden="true" />

      <button ref={exitRef} type="button" className="recon-chip recon-film-exit" onClick={() => engine.exitCinematic()}>
        Exit film <kbd>Esc</kbd>
      </button>

      <div className="recon-film-title" aria-hidden={state.finished}>
        <p className="recon-eyebrow">{recorded ? rideDate(track.startedAt) : "Route preview"}</p>
        <h1 className="recon-film-name">{track.name}</h1>
        <p className="recon-film-sub">
          {miles(track.distanceMeters)}
          {recorded ? ` · ${duration(track.facts.durationMinutes)}` : ""}
          {track.facts.ascentMeters !== null ? ` · ≈${feet(track.facts.ascentMeters)} of climbing` : ""}
        </p>
      </div>

      <div className="recon-film-lower" aria-hidden="true">
        <span ref={mileRef}>0.0 mi</span>
        <span ref={altitudeRef}>—</span>
        {recorded ? <span ref={timeRef}>0:00</span> : null}
      </div>

      {state.finished ? (
        <section className="recon-film-end" aria-labelledby="recon-film-end-title">
          <p className="recon-eyebrow">{recorded ? "That was your ride" : "That's the route"}</p>
          <h2 id="recon-film-end-title" className="recon-film-name">
            {track.name}
          </h2>
          <dl className="recon-stats">
            <div>
              <dt>Distance</dt>
              <dd>{miles(track.distanceMeters)}</dd>
            </div>
            {recorded ? (
              <div>
                <dt>Time</dt>
                <dd>{duration(track.facts.durationMinutes)}</dd>
              </div>
            ) : null}
            {xray?.summary.twistiness != null ? (
              <div>
                <dt>Twistiness</dt>
                <dd>{xray.summary.twistiness}/100</dd>
              </div>
            ) : null}
            {exploration && recorded ? (
              <div>
                <dt>New to you</dt>
                <dd className="recon-ember-text">{miles(exploration.newToYouMeters)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="recon-actions">
            <button type="button" className="recon-button recon-button-primary" onClick={() => engine.play()}>
              Watch again
            </button>
            <button type="button" className="recon-button" onClick={() => engine.exitCinematic()}>
              {recorded ? "Back to replay" : "Back to preview"}
            </button>
          </div>
        </section>
      ) : !state.playing ? (
        <button type="button" className="recon-film-play" onClick={() => engine.play()}>
          ▶ Play film
        </button>
      ) : null}

      <div className="recon-film-progress" aria-hidden="true">
        <div ref={progressRef} />
      </div>
    </div>
  )
}
