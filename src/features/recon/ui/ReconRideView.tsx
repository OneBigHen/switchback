"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Map as MapLibreMap } from "maplibre-gl"
import { useGravelEvidence, useReconLibrary, useResolvedTrack } from "@/features/recon/data/use-recon-library"
import { classifyExploration, priorRecordedRides } from "@/features/recon/intel/exploration"
import { buildXRay } from "@/features/recon/intel/xray"
import { buildCinematicPlan } from "@/features/recon/cinematic/shot-plan"
import { setEvidence, setHistory, setSelected, setSelectedEmphasis } from "@/features/recon/map/recon-layers"
import { prefersReducedMotion } from "@/features/recon/map/recon-map-style"
import { displayPath } from "@/features/recon/replay/replay-timeline"
import { ReplayEngine, type EngineState } from "@/features/recon/replay/replay-engine"
import type { ReconCameraMode } from "@/features/recon/replay/camera-director"
import { rideDate } from "./recon-format"
import ReplayControls from "./ReplayControls"
import XRayPanel from "./XRayPanel"
import CinematicLayer from "./CinematicLayer"

const ReconMap = dynamic(() => import("@/features/recon/map/ReconMap"), {
  ssr: false,
  loading: () => <div className="recon-map recon-map-loading" aria-hidden="true" />
})

declare global {
  interface Window {
    __reconReplayDebug?: { progress(): number; playing(): boolean; cinematic(): boolean }
  }
}

interface ReconRideViewProps {
  trackId: string
  startFilm: boolean
}

/**
 * One ride, brought back: Replay on the real recorded timeline, a synchronized
 * X-Ray, and an authored Cinematic film — all over the same single map.
 */
export default function ReconRideView({ trackId, startFilm }: ReconRideViewProps) {
  const library = useReconLibrary()
  const load = useResolvedTrack(library, trackId)
  const track = load.state === "ready" ? load.track : null
  const evidence = useGravelEvidence(track)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [engine, setEngine] = useState<ReplayEngine | null>(null)
  const [engineState, setEngineState] = useState<EngineState | null>(null)
  const [xrayOpen, setXrayOpen] = useState(false)
  const [engineFailed, setEngineFailed] = useState(false)

  const recordedRides = useMemo(() => library.rides.filter((ride) => ride.playbackKind === "recorded"), [library.rides])
  const exploration = useMemo(
    () => (track?.playbackKind === "recorded" && library.ridesState === "ready" ? classifyExploration(track, priorRecordedRides(track, recordedRides)) : null),
    [track, recordedRides, library.ridesState]
  )
  const xray = useMemo(() => (track ? buildXRay(track, evidence) : null), [track, evidence])

  const engineRef = useRef<ReplayEngine | null>(null)
  const onReady = useCallback((ready: MapLibreMap) => setMap(ready), [])
  // The map is about to be removed: stop the loop and detach deck.gl first.
  const onDispose = useCallback(() => {
    engineRef.current?.dispose()
    setMap(null)
  }, [])

  useEffect(() => {
    if (!map || !track) return
    setSelected(map, track, null)
    setSelectedEmphasis(map, "ahead")
    setHistory(map, recordedRides.filter((ride) => ride.id !== track.id))
  }, [map, track, recordedRides])

  useEffect(() => {
    if (map) setEvidence(map, evidence)
  }, [map, evidence])

  // Engine lifecycle: one engine per (map, track). The deck.gl overlay loads
  // lazily; if it fails, Replay still runs with the camera and readouts.
  useEffect(() => {
    if (!map || !track) return
    let disposed = false
    let created: ReplayEngine | null = null
    const compact = map.getCanvas().clientWidth < 720
    const mode: ReconCameraMode = compact ? "overview" : "chase"
    import("@/features/recon/replay/replay-overlay")
      .then(({ createReplayOverlay }) => createReplayOverlay(map))
      .catch(() => null)
      .then((overlay) => {
        if (disposed) {
          overlay?.dispose()
          return
        }
        try {
          created = new ReplayEngine(map, track, overlay, null, prefersReducedMotion(), mode)
          engineRef.current = created
          setEngine(created)
        } catch {
          overlay?.dispose()
          setEngineFailed(true)
        }
      })
    return () => {
      disposed = true
      created?.dispose()
      engineRef.current = null
      setEngine(null)
      setEngineState(null)
    }
  }, [map, track])

  useEffect(() => {
    engine?.setSegments(exploration?.segments ?? null)
  }, [engine, exploration])

  useEffect(() => {
    if (!engine) return
    const offState = engine.onState(setEngineState)
    let progress = 0
    const offFrame = engine.onFrame((frame) => (progress = frame.frame.progress))
    window.__reconReplayDebug = { progress: () => progress, playing: () => engine.state().playing, cinematic: () => engine.state().cinematic }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onMotion = () => engine.setReducedMotion(media.matches)
    media.addEventListener("change", onMotion)
    return () => {
      offState()
      offFrame()
      media.removeEventListener("change", onMotion)
      delete window.__reconReplayDebug
    }
  }, [engine])

  const startCinematic = useCallback(() => {
    if (!engine || !track) return
    const path = displayPath(track)
    if (!path) return
    setXrayOpen(false)
    engine.startCinematic(buildCinematicPlan({ id: track.id, path, twistiness: xray?.bins.map((bin) => bin.twistiness) ?? [] }))
  }, [engine, track, xray])

  // `?film=1` opens straight into the film, once, as soon as it can be planned.
  const filmStartedRef = useRef(false)
  useEffect(() => {
    if (!startFilm || !engine || !xray || filmStartedRef.current) return
    filmStartedRef.current = true
    engine.startCinematic(buildCinematicPlan({ id: engine.trackId, path: displayPath(track!)!, twistiness: xray.bins.map((bin) => bin.twistiness) }))
  }, [startFilm, engine, xray, track])

  // Keyboard: space play/pause, ←/→ step, X X-Ray, C film, 1–5 camera, Esc exits film.
  useEffect(() => {
    if (!engine) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (target && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) && event.key !== "Escape") {
        if (!(target instanceof HTMLInputElement && target.type === "range" && event.key === " ")) return
      }
      const cinematic = engine.state().cinematic
      if (event.key === "Escape" && cinematic) engine.exitCinematic()
      else if (event.key === " " && !(target instanceof HTMLButtonElement)) engine.toggle()
      else if (event.key === "ArrowRight" && !cinematic) engine.step(event.shiftKey ? 60 : 10)
      else if (event.key === "ArrowLeft" && !cinematic) engine.step(event.shiftKey ? -60 : -10)
      else if (event.key.toLowerCase() === "x" && !cinematic) setXrayOpen((open) => !open)
      else if (event.key.toLowerCase() === "c" && !cinematic) startCinematic()
      else if (/^[1-5]$/.test(event.key) && !cinematic) engine.setMode((["overview", "chase", "lead", "orbit", "free"] as const)[Number(event.key) - 1]!)
      else return
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [engine, startCinematic])

  const cinematic = engineState?.cinematic ?? false
  const recorded = track?.playbackKind === "recorded"

  return (
    <div className={`recon-root recon-ride${cinematic ? " is-cinematic" : ""}${xrayOpen ? " has-xray" : ""}`}>
      <ReconMap atmosphere="dusk" onReady={onReady} onDispose={onDispose} />
      <div className="recon-vignette recon-vignette-strong" aria-hidden="true" />

      {load.state === "unavailable" || engineFailed ? (
        <section className="recon-empty" aria-labelledby="recon-missing-title">
          <p className="recon-eyebrow">OpenGravel Labs · Recon</p>
          <h1 id="recon-missing-title" className="recon-empty-title">
            {engineFailed ? "This ride's GPS data can't be played back." : load.state === "unavailable" ? load.message : ""}
          </h1>
          <Link className="recon-button recon-button-primary" href="/labs/recon">
            ← All rides
          </Link>
        </section>
      ) : null}

      {track && !cinematic ? (
        <header className="recon-topbar">
          <Link href="/labs/recon" className="recon-chip recon-glass">
            ← All rides
          </Link>
          <div className="recon-title recon-glass">
            <p className="recon-eyebrow">{recorded ? `Replay · ${rideDate(track.startedAt)}` : "Route preview · no recorded time"}</p>
            <h1 className="recon-title-name">{track.name}</h1>
          </div>
          <div className="recon-topbar-actions">
            <button type="button" className="recon-chip recon-glass" aria-pressed={xrayOpen} aria-controls="recon-xray" onClick={() => setXrayOpen((open) => !open)} disabled={!xray}>
              X-Ray
            </button>
            <button type="button" className="recon-chip recon-glass recon-chip-accent" onClick={startCinematic} disabled={!engine}>
              {recorded ? "Cinematic" : "Flyover film"}
            </button>
          </div>
        </header>
      ) : null}

      {track && load.state === "ready" && !engine && !engineFailed ? (
        <p className="recon-toast recon-glass" role="status">
          Preparing the replay…
        </p>
      ) : null}

      {track && engine && engineState && !cinematic ? (
        <ReplayControls engine={engine} state={engineState} track={track} xray={xray} segments={exploration?.segments ?? null} exploration={exploration} />
      ) : null}

      {track && engine && xray && xrayOpen && !cinematic ? (
        <XRayPanel engine={engine} track={track} report={xray} exploration={exploration} evidenceKnown={evidence !== null} onClose={() => setXrayOpen(false)} />
      ) : null}

      {track && engine && engineState && cinematic ? <CinematicLayer engine={engine} state={engineState} track={track} xray={xray} exploration={exploration} /> : null}
    </div>
  )
}
