"use client"

import {
  CaretDown,
  CaretUp,
  DownloadSimple,
  FloppyDisk,
  ListNumbers,
  NavigationArrow
} from "@phosphor-icons/react"
import { useLayoutEffect, useRef, useState } from "react"
import type { PlannedRoute } from "@/lib/routing/types"
import { ManeuverGlyph } from "./maneuver-glyph"
import { maneuverKind } from "@/lib/client/maneuver"
import { RoadLockSatisfactionBadge } from "./RoadLockSatisfactionBadge"
import { RouteDataQualityPanel } from "./RouteDataQualityPanel"
import { RouteWeatherPanel } from "./RouteWeatherPanel"
import { TripStagePanel } from "./TripStagePanel"
import { RouteRating } from "./RouteRating"
import { RouteSharePanel } from "./RouteSharePanel"
import { CommunityPublishPanel } from "./CommunityPublishPanel"
import { RouteEvidencePanel } from "./RouteEvidencePanel"
import type { GpxExportVariant } from "@/lib/routing/gpx"
import type { RiderPreference } from "@/lib/intelligence/rider-preferences"
import type { TripStagePlan } from "@/lib/trip/stage-planner"
import type { TripStageConstraints } from "@/lib/trip/stage-planner"
import type { TripPlan } from "@/lib/trip/trip-plan"
import type { RoadLockSatisfaction } from "@/lib/roads/road-locks"
import { MustLockUnresolvedPanel } from "./MustLockUnresolvedPanel"
import type { MustLockUnresolvedOption } from "@/lib/roads/road-locks"
import type { ReplayComparisonResult } from "@/lib/client/replay-comparison"
import type { RecordedRide } from "@/lib/storage/ride-journal"
import type { GpxJoinChoice, GpxJoinPreview } from "@/lib/gpx/join"
import {
  explainRouteFacts,
  routeCharacterSummary,
  routeTradeoff
} from "@/lib/recommendation/route-explanations"
import { loadRiderSettings } from "@/lib/settings/rider-settings"
import {
  formatDistanceMeters,
  formatDistanceMiles,
  formatManeuverDistance
} from "@/lib/settings/rider-units"
import { GpxIntelligencePanel } from "./GpxIntelligencePanel"

interface RouteComparisonProps {
  routes: PlannedRoute[]
  selectedId: string
  onSelect(id: string): void
  onSave(route: PlannedRoute): void
  onExport(route: PlannedRoute, variant: GpxExportVariant): void
  onRide(route: PlannedRoute): void
  onRate?(route: PlannedRoute, motorcycleId: string, rating: 1 | 2 | 3 | 4 | 5): Promise<RiderPreference> | void
  onShareCreated?(url: string): void
  savedTrip?: TripPlan
  onSaveTrip?(route: PlannedRoute, plan: TripStagePlan, constraints: TripStageConstraints): void
  showRideAction?: boolean
  sourceMapUpdated?: string | null
  /** Recovery actions for a must road-lock the route could not satisfy. */
  onResolveMustLock?(lockId: string, option: MustLockUnresolvedOption): void
  /** The route that existed before the current plan; restored on demand. */
  previousRoute?: PlannedRoute | null
  /** On-track comparison for a recorded ride loaded beside its plan. */
  replayComparison?: ReplayComparisonResult | null
  recordedRide?: RecordedRide | null
  onExportRecordedRide?(ride: RecordedRide): void
  onPrepareJoin?(route: PlannedRoute): Promise<GpxJoinPreview | null>
  onJoin?(route: PlannedRoute, preview: GpxJoinPreview, choice: GpxJoinChoice): Promise<void>
  /** Keep the legacy route rack available as preparation details during V2 migration. */
  showRouteChoices?: boolean
}

function dominantMix(mix: Record<string, number>): string {
  const dominant = Object.entries(mix)
    .filter(([, share]) => Number.isFinite(share) && share > 0)
    .sort((left, right) => right[1] - left[1])[0]
  if (!dominant) return "Road mix unavailable"
  return `${Math.round(dominant[1])}% ${dominant[0].replaceAll("_", " ")}`
}

const UNPAVED_SURFACES = new Set([
  "compacted",
  "dirt",
  "earth",
  "fine_gravel",
  "grass",
  "gravel",
  "ground",
  "mud",
  "sand",
  "unpaved"
])

function unpavedPercent(mix: Record<string, number>): number {
  return Math.round(Object.entries(mix).reduce(
    (total, [surface, percent]) => total + (UNPAVED_SURFACES.has(surface.toLowerCase()) ? percent : 0),
    0
  ))
}

function hasKnownSurfaceData(mix: Record<string, number>): boolean {
  return Object.entries(mix).some(
    ([surface, share]) => surface.toLowerCase() !== "unknown" && Number.isFinite(share) && share > 0
  )
}

function hasSkippedPreferLock(route: PlannedRoute): RoadLockSatisfaction | undefined {
  return route.lockSatisfaction?.find((row) => row.mode === "prefer" && Boolean(row.skippedReason))
}

function formatUnknownSurfaceMiles(route: PlannedRoute, units: "imperial" | "metric"): string | null {
  const surfaceEntries = Object.entries(route.surfaceMix)
  const surfaceTotal = surfaceEntries.reduce((sum, [, share]) => sum + (Number.isFinite(share) ? Math.max(0, share) : 0), 0)
  if (surfaceTotal <= 0 || route.distanceMiles <= 0) return null
  const unknown = surfaceEntries
    .filter(([surface]) => surface.toLowerCase() === "unknown")
    .reduce((sum, [, share]) => sum + (Number.isFinite(share) ? Math.max(0, share) / surfaceTotal : 0) * route.distanceMiles, 0)
  if (unknown <= 0) return null
  const formatted = formatDistanceMiles(unknown, units)
  return `${formatted.value} ${formatted.unit}`.trim()
}

function routeReason(route: PlannedRoute): string {
  switch (route.profile) {
    case "quick":
      return "Lowest travel time"
    case "balanced":
      return "Practical balance of pace and road quality"
    case "twisty":
      return "Most curves and direction changes"
    case "scenic":
      return "Balanced for back roads"
    case "adventure":
      return "Targets gravel and unpaved roads"
    case "gravel":
      return "Maximizes mapped gravel"
    case "avoid-highways":
      return "Hard-avoids motorways and trunk roads"
    case "neural":
      return "Ranked from your local riding history"
  }
}

function officialUnpavedLabel(route: PlannedRoute): string | null {
  const evidence = route.officialUnpavedEvidence
  if (!evidence) return null
  if (evidence.sharePercent <= 0) return "Official PA data checked"
  const share = evidence.sharePercent < 0.1 ? "<0.1" : evidence.sharePercent.toFixed(1)
  return `${share}% official PA unpaved`
}

export function RouteComparison({
  routes,
  selectedId,
  onSelect,
  onSave,
  onExport,
  onRide,
  showRideAction = true,
  onRate,
  onShareCreated,
  onSaveTrip,
  savedTrip,
  sourceMapUpdated,
  onResolveMustLock,
  previousRoute,
  replayComparison,
  recordedRide,
  onExportRecordedRide,
  onPrepareJoin,
  onJoin,
  showRouteChoices = true
}: RouteComparisonProps) {
  const [directionsOpen, setDirectionsOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [exportVariant, setExportVariant] = useState<GpxExportVariant>("track")
  const [joinPreview, setJoinPreview] = useState<GpxJoinPreview | null>(null)
  const [joinPreviewRouteId, setJoinPreviewRouteId] = useState<string | null>(null)
  const [joinBusy, setJoinBusy] = useState(false)
  const [dismissedMustLockIds, setDismissedMustLockIds] = useState<string[]>([])
  const selectedRouteIdentityRef = useRef<HTMLParagraphElement>(null)
  const selectedRoute = routes.find((route) => route.id === selectedId)
  const selectedRouteId = selectedRoute?.id
  const selectedRecordedRide = selectedRoute && recordedRide && selectedRoute.id === `${recordedRide.id}-actual` ? recordedRide : null
  const activeJoinPreview = selectedRoute?.id === joinPreviewRouteId ? joinPreview : null
  const activeExportVariant = exportVariant === "recorded" && !selectedRecordedRide ? "track" : exportVariant
  const units = loadRiderSettings().units

  const routeFacts = selectedRoute ? explainRouteFacts(selectedRoute, routes, units) : []

  useLayoutEffect(() => {
    if (!selectedRouteId) return
    selectedRouteIdentityRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" })
  }, [directionsOpen, detailsOpen, selectedRouteId])

  const prepareJoin = async () => {
    if (!onPrepareJoin || !selectedRoute) return
    setJoinBusy(true)
    try {
      setJoinPreview(await onPrepareJoin(selectedRoute))
      setJoinPreviewRouteId(selectedRoute.id)
    } finally {
      setJoinBusy(false)
    }
  }

  const chooseJoin = async (choice: GpxJoinChoice) => {
    if (!activeJoinPreview || !onJoin || !selectedRoute) return
    setJoinBusy(true)
    try {
      await onJoin(selectedRoute, activeJoinPreview, choice)
      setJoinPreview(null)
      setJoinPreviewRouteId(null)
    } finally {
      setJoinBusy(false)
    }
  }

  return (
    <section className="route-rack" aria-labelledby="route-rack-title">
      <div className="section-heading">
        <div>
          <h2 id="route-rack-title">{showRouteChoices ? "Choose a route" : "Route details"}</h2>
          {selectedRoute ? (
            <p ref={selectedRouteIdentityRef} className="route-selection-identity">
              <span>Selected route</span>
              <strong>{selectedRoute.name}</strong>
            </p>
          ) : null}
        </div>
      </div>

      {showRouteChoices ? (
        <div className="route-slips">
          {routes.map((route, index) => {
            const selected = route.id === selectedId
            const officialUnpaved = officialUnpavedLabel(route)
            const unknownSurfaceLabel = formatUnknownSurfaceMiles(route, units)
            const skippedSatisfaction = hasSkippedPreferLock(route)
            const hasSurfaceData = hasKnownSurfaceData(route.surfaceMix)
            const routeDistance = formatDistanceMiles(route.distanceMiles, units)
            return (
              <button
                className={`route-slip${selected ? " is-selected" : ""}`}
                type="button"
                key={route.id}
                aria-label={`Select ${route.name}`}
                aria-pressed={selected}
                onClick={() => onSelect(route.id)}
              >
                <span className="route-slip-index">{index + 1}.</span>
                <span className="route-slip-body">
                  <span className="route-slip-name">
                    <strong>{route.name}</strong>
                    <small>{routeReason(route)}</small>
                    <small className="route-slip-tradeoff">{routeTradeoff(route, routes, units)}</small>
                  </span>
                  <span className="route-character">
                    <span>{dominantMix(route.roadMix)}</span>
                    <span>{hasSurfaceData ? `${unpavedPercent(route.surfaceMix)}% unpaved` : "Surface data unavailable"}</span>
                    {unknownSurfaceLabel ? (
                      <span className="route-character-unknown">~{unknownSurfaceLabel} unknown surface</span>
                    ) : null}
                    {officialUnpaved ? <span className="official-unpaved">{officialUnpaved}</span> : null}
                    {route.overlapPercent !== undefined && route.overlapPercent < 99 ? (
                      <span>{Math.round(100 - route.overlapPercent)}% different</span>
                    ) : null}
                  </span>
                  {skippedSatisfaction ? (
                    <RoadLockSatisfactionBadge satisfaction={skippedSatisfaction} displayName={route.name} />
                  ) : null}
                </span>
                <span className="route-slip-stats">
                  <span className="route-slip-metric">
                      <strong>{routeDistance.value}</strong>
                      <small>{routeDistance.unit || "distance"}</small>
                  </span>
                  <span className="route-slip-metric">
                    <strong>{Math.round(route.durationMinutes)}</strong>
                    <small>min</small>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {selectedRoute ? <>

      <div className="directions-panel">
        <button
          type="button"
          className="directions-toggle"
          aria-label={`${directionsOpen ? "Hide" : "Show"} turn-by-turn directions`}
          aria-expanded={directionsOpen}
          aria-controls="route-directions"
          onClick={() => setDirectionsOpen((open) => !open)}
        >
          <span><ListNumbers aria-hidden="true" /> Turn-by-turn directions</span>
          <span>
            {selectedRoute.instructions.length} steps
            {directionsOpen ? <CaretUp aria-hidden="true" /> : <CaretDown aria-hidden="true" />}
          </span>
        </button>
        {directionsOpen ? (
          <div id="route-directions" className="directions-list" role="region" aria-label="Turn-by-turn directions">
            {selectedRoute.instructions.length > 0 ? (
              <ol>
                {selectedRoute.instructions.map((instruction, index) => {
                  const kind = maneuverKind(instruction.sign)
                  return (
                    <li key={`${instruction.interval[0]}-${instruction.interval[1]}-${index}`}>
                      <span className="directions-icon" aria-hidden="true">
                        <ManeuverGlyph kind={kind} />
                      </span>
                      <span className="directions-text">
                        <strong>{instruction.text}</strong>
                        <small>{instruction.streetName || "Unnamed road"}</small>
                      </span>
                      <b className="directions-distance">
                        {formatManeuverDistance(instruction.distanceMeters, units)}
                      </b>
                    </li>
                  )
                })}
              </ol>
            ) : <p>No turn instructions are available for this route.</p>}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="route-details-toggle"
        aria-label={detailsOpen ? "Hide route details" : "Show route details"}
        aria-expanded={detailsOpen}
        aria-controls="route-preparation"
        onClick={() => setDetailsOpen((open) => !open)}
      >
        <span>{detailsOpen ? "Hide preparation" : "Prepare ride"}</span>
        {" "}
        <small>Weather, surface, route evidence, offline limits, and export</small>
      </button>

      {showRideAction && selectedRoute ? (
        <button type="button" className="ride-button route-primary-ride" onClick={() => onRide(selectedRoute)}>
          <NavigationArrow weight="fill" aria-hidden="true" />
          <span>Start ride</span>
        </button>
      ) : null}

      {detailsOpen ? <div id="route-preparation" className="route-preparation">
      <RouteDataQualityPanel route={selectedRoute} sourceMapUpdated={sourceMapUpdated ?? null} />

      {selectedRoute.gpxIntelligence ? <GpxIntelligencePanel report={selectedRoute.gpxIntelligence} /> : null}

      {selectedRoute.navigationMode === "track-only" && !selectedRoute.gpxParentRouteId && onPrepareJoin && onJoin ? (
        <div className="gpx-join-panel" role="region" aria-label="Join GPX track">
          <strong>Join GPX track</strong>
          <p>Route to a safe entry, then switch to track-only guidance. The GPX line is never silently snapped to a road.</p>
          {!activeJoinPreview ? (
            <button type="button" className="tool-button" disabled={joinBusy} onClick={() => void prepareJoin()}>
              {joinBusy ? "Finding entries…" : "Find entries from current location"}
            </button>
          ) : (
            <div className="gpx-join-options">
              <button type="button" className="tool-button" disabled={joinBusy || activeJoinPreview.bestIndex == null} onClick={() => void chooseJoin("best")}>
                Best join
              </button>
              <button type="button" className="tool-button" disabled={joinBusy || activeJoinPreview.candidates.find((candidate) => candidate.index === 0)?.rejectedReason != null} onClick={() => void chooseJoin("original-start")}>
                Original start
              </button>
              <span>Choose entry</span>
              {activeJoinPreview.candidates.filter((candidate) => !candidate.rejectedReason).slice(0, 8).map((candidate) => (
                <button type="button" className="tool-button" disabled={joinBusy} key={`${candidate.index}-${candidate.kind}`} onClick={() => void chooseJoin(candidate.index)}>
                  {candidate.label} · {formatDistanceMeters(candidate.approachDistanceMeters, units).value} {formatDistanceMeters(candidate.approachDistanceMeters, units).unit} approach · {formatDistanceMeters(candidate.remainingDistanceMeters, units).value} {formatDistanceMeters(candidate.remainingDistanceMeters, units).unit} left
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {routeFacts.length > 0 ? (
        <div className="route-fact-list" role="note" aria-label="Measured route facts">
          <strong>Measured route facts</strong>
          <ul>
            {routeFacts.map((fact) => <li key={fact}>{fact}</li>)}
          </ul>
        </div>
      ) : null}

      {selectedRoute.routeScore ? (
        <section className="route-character-summary" aria-label="Route character">
          <div className="route-score-explanation" role="note" aria-label="Why this route scored well">
            <strong>Why this route</strong>
            <span>{routeCharacterSummary(selectedRoute, units)}</span>
            <small>Route quality {Math.round(selectedRoute.routeScore.total)}/100</small>
          </div>
        </section>
      ) : null}

      {selectedRoute.lockSatisfaction?.length ? (
        <div className="route-lock-satisfaction-list" aria-label="Road lock satisfaction for this route">
          {selectedRoute.lockSatisfaction
            .filter((row) => Boolean(row.skippedReason))
            .map((row) => (
              <RoadLockSatisfactionBadge
                key={row.lockId}
                satisfaction={row}
                displayName={selectedRoute.name}
              />
            ))}
        </div>
      ) : null}

      {onResolveMustLock ? (
        selectedRoute.lockSatisfaction
          ?.filter((row) => row.mode === "must" && !row.satisfied && !dismissedMustLockIds.includes(row.lockId))
          .slice(0, 1)
          .map((row) => (
            <MustLockUnresolvedPanel
              key={row.lockId}
              satisfaction={row}
              displayName={selectedRoute.name}
              previousRoute={previousRoute ?? null}
              onResolve={(option) => onResolveMustLock(row.lockId, option)}
              onDismiss={() => setDismissedMustLockIds((ids) => [...ids, row.lockId])}
            />
          ))
      ) : null}

      {replayComparison && selectedRoute.id === `${replayComparison.rideId}-actual` ? (
        <div className="route-replay-comparison" role="note" aria-label="Recorded ride comparison">
          <strong>Replay comparison</strong>
          <span>
            {replayComparison.onTrackPercent}% on track · avg offset{" "}
            {replayComparison.averageOffsetMeters} m · max {replayComparison.maxOffsetMeters} m ·{" "}
            {replayComparison.recordedDistanceMiles} mi ridden vs {replayComparison.plannedDistanceMiles} mi planned
          </span>
        </div>
      ) : null}

      <RouteWeatherPanel route={selectedRoute} />

      <RouteEvidencePanel route={selectedRoute} />

      <TripStagePanel key={savedTrip?.routeId === selectedRoute.id ? savedTrip.id : selectedRoute.id} route={selectedRoute} savedTrip={savedTrip?.routeId === selectedRoute.id ? savedTrip : undefined} onSave={(plan, constraints) => onSaveTrip?.(selectedRoute, plan, constraints)} />

      <RouteRating route={selectedRoute} onRate={onRate} />

      <RouteSharePanel route={selectedRoute} onShareCreated={onShareCreated} />

      <CommunityPublishPanel route={selectedRoute} />

      <div className="route-actions" aria-label="Selected route actions">
        <button type="button" className="tool-button" onClick={() => onSave(selectedRoute)}>
          <FloppyDisk aria-hidden="true" />
          <span>Save route</span>
        </button>
        <label className="gpx-export-variant">
          <span>GPX format</span>
          <select aria-label="GPX export format" value={activeExportVariant} onChange={(event) => setExportVariant(event.currentTarget.value as GpxExportVariant)}>
            <option value="track">Track</option>
            <option value="track-waypoints">Track + waypoints</option>
            <option value="route">Route</option>
            <option value="original">Original</option>
            {selectedRecordedRide && onExportRecordedRide ? <option value="recorded">Recorded ride</option> : null}
          </select>
        </label>
        <button type="button" className="tool-button" onClick={() => {
          if (activeExportVariant === "recorded" && selectedRecordedRide) onExportRecordedRide?.(selectedRecordedRide)
          else onExport(selectedRoute, activeExportVariant)
        }}>
          <DownloadSimple aria-hidden="true" />
          <span>Export GPX</span>
        </button>
      </div>
      </div> : null}
      </> : (
        <p className="route-selection-prompt" role="status">Choose a route above to review details and prepare your ride.</p>
      )}
    </section>
  )
}
