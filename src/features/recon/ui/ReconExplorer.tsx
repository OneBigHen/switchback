"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { LngLatBoundsLike, Map as MapLibreMap } from "maplibre-gl"
import type { Coordinate } from "@/lib/routing/types"
import type { ReconTrack } from "@/features/recon/types"
import { useGravelEvidence, useReconLibrary, useResolvedTrack, type CatalogEntry } from "@/features/recon/data/use-recon-library"
import { classifyExploration, priorRecordedRides } from "@/features/recon/intel/exploration"
import { setEvidence, setHistory, setSelected } from "@/features/recon/map/recon-layers"
import { prefersReducedMotion, RECON_FIT_DURATION_MS, RECON_FIT_MAX_ZOOM } from "@/features/recon/map/recon-map-style"
import { chordBearing } from "@/features/recon/replay/camera-director"
import { displayPath } from "@/features/recon/replay/replay-timeline"
import { duration, feet, miles, shortDate, rideDate } from "./recon-format"

const ReconMap = dynamic(() => import("@/features/recon/map/ReconMap"), {
  ssr: false,
  loading: () => <div className="recon-map recon-map-loading" aria-hidden="true" />
})

/**
 * Explorer: every recorded ride laid over pitched terrain, one selected ride
 * painted by what was new to you, and one obvious way into Replay.
 */
export default function ReconExplorer() {
  const library = useReconLibrary()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [map, setMap] = useState<MapLibreMap | null>(null)

  const effectiveId =
    selectedId ?? library.rides.find((ride) => ride.playbackKind === "recorded")?.id ?? library.rides[0]?.id ?? (library.ridesState !== "loading" ? library.catalog[0]?.id : null) ?? null
  const load = useResolvedTrack(library, effectiveId)
  const track = load.state === "ready" ? load.track : null
  const evidence = useGravelEvidence(track)

  const recordedRides = useMemo(() => library.rides.filter((ride) => ride.playbackKind === "recorded"), [library.rides])
  const exploration = useMemo(
    () => (track?.playbackKind === "recorded" ? classifyExploration(track, priorRecordedRides(track, recordedRides)) : null),
    [track, recordedRides]
  )

  useEffect(() => {
    if (!map) return
    setHistory(map, recordedRides.filter((ride) => ride.id !== track?.id))
  }, [map, recordedRides, track])

  useEffect(() => {
    if (!map) return
    setSelected(map, track, exploration?.segments ?? null)
  }, [map, track, exploration])

  useEffect(() => {
    if (map) setEvidence(map, evidence)
  }, [map, evidence])

  const fittedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!map) return
    if (track && fittedRef.current !== track.id) {
      fittedRef.current = track.id
      fitTrack(map, track)
    } else if (!track && recordedRides.length > 0 && fittedRef.current === null) {
      fittedRef.current = "history"
      fitTracks(map, recordedRides)
    }
  }, [map, track, recordedRides])

  const onReady = useCallback((ready: MapLibreMap) => setMap(ready), [])
  const onDispose = useCallback(() => setMap(null), [])

  const totals = useMemo(() => {
    const meters = recordedRides.reduce((sum, ride) => sum + ride.distanceMeters, 0)
    const minutes = recordedRides.reduce((sum, ride) => sum + (ride.facts.durationMinutes ?? 0), 0)
    return { rides: recordedRides.length, meters, minutes }
  }, [recordedRides])

  const settled = library.ridesState !== "loading" && library.catalogState !== "loading"
  const empty = settled && library.rides.length === 0 && library.catalog.length === 0

  return (
    <div className="recon-root">
      <ReconMap atmosphere="day" onReady={onReady} onDispose={onDispose} />
      <div className="recon-vignette" aria-hidden="true" />

      <header className="recon-brand">
        <Link href="/" className="recon-brand-back" aria-label="Back to the OpenGravel planner">
          ←
        </Link>
        <div>
          <p className="recon-eyebrow">OpenGravel Labs</p>
          <h1 className="recon-wordmark">Recon</h1>
        </div>
        <button
          type="button"
          className="recon-chip recon-panel-toggle"
          aria-expanded={panelOpen}
          aria-controls="recon-rides-panel"
          onClick={() => setPanelOpen((open) => !open)}
        >
          {panelOpen ? "Hide rides" : "Rides"}
        </button>
      </header>

      {empty ? (
        <section className="recon-empty" aria-labelledby="recon-empty-title">
          <p className="recon-eyebrow">Nothing to explore yet</p>
          <h2 id="recon-empty-title" className="recon-empty-title">
            Record a ride and Recon will bring it back to life.
          </h2>
          <p className="recon-quiet">
            Recon replays rides saved in this browser&apos;s ride journal. It never edits your routes or your journal.
          </p>
          <Link className="recon-button recon-button-primary" href="/">
            Open the planner
          </Link>
        </section>
      ) : null}

      {panelOpen && !empty ? (
        <aside id="recon-rides-panel" className="recon-panel recon-glass" aria-label="Rides and routes">
          {totals.rides > 0 ? (
            <dl className="recon-totals">
              <div>
                <dt>Rides</dt>
                <dd>{totals.rides}</dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>{miles(totals.meters, 0)}</dd>
              </div>
              <div>
                <dt>In the saddle</dt>
                <dd>{duration(totals.minutes)}</dd>
              </div>
            </dl>
          ) : null}
          <RideList library={library} selectedId={effectiveId} onSelect={setSelectedId} />
        </aside>
      ) : null}

      {track ? (
        <SelectedCard
          track={track}
          newToYouMeters={exploration?.newToYouMeters ?? null}
          comparedRideCount={exploration?.comparedRideCount ?? 0}
          knownGravel={evidence !== null && evidence.length > 0}
        />
      ) : load.state === "unavailable" ? (
        <p className="recon-toast recon-glass" role="status">
          {load.message}
        </p>
      ) : null}
    </div>
  )
}

function RideList({ library, selectedId, onSelect }: { library: ReturnType<typeof useReconLibrary>; selectedId: string | null; onSelect(id: string): void }) {
  const recorded = library.rides.filter((ride) => ride.playbackKind === "recorded")
  const journalPreviews = library.rides.filter((ride) => ride.playbackKind === "preview")
  return (
    <nav className="recon-lists" aria-label="Choose a ride">
      <h2 className="recon-section">Your rides</h2>
      {library.ridesState === "loading" ? (
        <p className="recon-quiet">Opening your ride journal…</p>
      ) : library.ridesState === "unavailable" ? (
        <p className="recon-quiet">Your ride journal can&apos;t be opened in this browser.</p>
      ) : recorded.length === 0 ? (
        <p className="recon-quiet">No recorded rides in this browser yet.</p>
      ) : (
        <ul className="recon-rows">
          {recorded.map((ride) => (
            <li key={ride.id}>
              <RowButton id={ride.id} selected={ride.id === selectedId} onSelect={onSelect} name={ride.name} meta={`${shortDate(ride.startedAt)} · ${miles(ride.distanceMeters)} · ${duration(ride.facts.durationMinutes)}`} badge="Ride" />
            </li>
          ))}
        </ul>
      )}
      {library.rejectedRideCount > 0 ? (
        <p className="recon-quiet">
          {library.rejectedRideCount} journal {library.rejectedRideCount === 1 ? "entry has" : "entries have"} unreadable GPS data and {library.rejectedRideCount === 1 ? "is" : "are"} left out.
        </p>
      ) : null}

      <h2 className="recon-section">Route previews</h2>
      {library.catalogState === "loading" ? (
        <p className="recon-quiet">Loading the Route Library…</p>
      ) : library.catalogState === "unavailable" && journalPreviews.length === 0 ? (
        <p className="recon-quiet">The Route Library is unavailable right now.</p>
      ) : (
        <ul className="recon-rows">
          {journalPreviews.map((ride) => (
            <li key={ride.id}>
              <RowButton id={ride.id} selected={ride.id === selectedId} onSelect={onSelect} name={ride.name} meta={`${miles(ride.distanceMeters)} · no recorded time`} badge="Preview" />
            </li>
          ))}
          {library.catalog.map((entry: CatalogEntry) => (
            <li key={entry.id}>
              <RowButton id={entry.id} selected={entry.id === selectedId} onSelect={onSelect} name={entry.name} meta="Route Library" badge="Preview" />
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

function RowButton({ id, name, meta, badge, selected, onSelect }: { id: string; name: string; meta: string; badge: "Ride" | "Preview"; selected: boolean; onSelect(id: string): void }) {
  return (
    <button type="button" className="recon-row" aria-pressed={selected} onClick={() => onSelect(id)}>
      <span className="recon-row-name">{name}</span>
      <span className="recon-row-meta">
        <span className={badge === "Ride" ? "recon-badge recon-badge-ride" : "recon-badge recon-badge-preview"}>{badge}</span>
        {meta}
      </span>
    </button>
  )
}

function SelectedCard({ track, newToYouMeters, comparedRideCount, knownGravel }: { track: ReconTrack; newToYouMeters: number | null; comparedRideCount: number; knownGravel: boolean }) {
  const recorded = track.playbackKind === "recorded"
  const href = `/labs/recon/replay/${encodeURIComponent(track.id)}`
  return (
    <section className="recon-card recon-glass" aria-labelledby="recon-card-title">
      <p className="recon-eyebrow">{recorded ? `Recorded ride · ${rideDate(track.startedAt)}` : "Route preview · no recorded time"}</p>
      <h2 id="recon-card-title" className="recon-card-title">
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
        {track.facts.ascentMeters !== null ? (
          <div>
            <dt>Climb</dt>
            <dd>≈{feet(track.facts.ascentMeters)}</dd>
          </div>
        ) : null}
        {newToYouMeters !== null ? (
          <div>
            <dt>New to you</dt>
            <dd className="recon-ember-text">{miles(newToYouMeters)}</dd>
          </div>
        ) : null}
      </dl>
      {recorded ? (
        <p className="recon-legend">
          <span className="recon-key recon-key-new" aria-hidden="true" /> New to you
          <span className="recon-key recon-key-ridden" aria-hidden="true" /> Ridden before
          {knownGravel ? (
            <>
              <span className="recon-key recon-key-gravel" aria-hidden="true" /> Known gravel
            </>
          ) : null}
          {comparedRideCount === 0 ? <span className="recon-quiet-inline"> · no earlier rides to compare</span> : null}
        </p>
      ) : knownGravel ? (
        <p className="recon-legend">
          <span className="recon-key recon-key-gravel" aria-hidden="true" /> Known gravel from the Gravel Atlas
        </p>
      ) : null}
      <div className="recon-actions">
        <Link className="recon-button recon-button-primary" href={href}>
          {recorded ? "▶ Replay ride" : "▶ Preview flyover"}
        </Link>
        <Link className="recon-button" href={`${href}?film=1`}>
          {recorded ? "Cinematic" : "Flyover film"}
        </Link>
      </div>
    </section>
  )
}

function boundsOf(coordinates: Iterable<Coordinate>): LngLatBoundsLike | null {
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const [lng, lat] of coordinates) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return Number.isFinite(west) ? [[west, south], [east, north]] : null
}

function fitTrack(map: MapLibreMap, track: ReconTrack): void {
  const bounds = boundsOf(track.geometry.coordinates)
  if (!bounds) return
  const path = displayPath(track)
  const wide = map.getCanvas().clientWidth > 900
  map.fitBounds(bounds, {
    padding: wide ? { top: 120, bottom: 260, left: 420, right: 120 } : { top: 110, bottom: 300, left: 32, right: 32 },
    pitch: 60,
    bearing: path ? (chordBearing(path, 0, 0, path.totalDistanceMeters * 0.5) ?? -18) : -18,
    maxZoom: RECON_FIT_MAX_ZOOM,
    duration: prefersReducedMotion() ? 0 : RECON_FIT_DURATION_MS,
    essential: true
  })
}

function* allCoordinates(tracks: readonly ReconTrack[]): Generator<Coordinate> {
  for (const track of tracks) yield* track.geometry.coordinates
}

function fitTracks(map: MapLibreMap, tracks: readonly ReconTrack[]): void {
  const bounds = boundsOf(allCoordinates(tracks))
  if (bounds) map.fitBounds(bounds, { padding: 120, pitch: 55, maxZoom: 12, duration: 0 })
}
