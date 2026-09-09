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
import { MustLockUnresolvedPanel } from "./MustLockUnresolvedPanel"
import type { MustLockUnresolvedOption } from "@/lib/roads/road-locks"
import type { ReplayComparisonResult } from "@/lib/client/replay-comparison"
import type { RecordedRide } from "@/lib/storage/ride-journal"
import type { GpxJoinChoice, GpxJoinPreview } from "@/lib/gpx/join"
import {
  explainRouteFacts,
  routeCharacterSummary
} from "@/lib/recommendation/route-explanations"
import { loadRiderSettings } from "@/lib/settings/rider-settings"
import {
  formatDistanceMeters,
  formatManeuverDistance
} from "@/lib/settings/rider-units"
import { GpxIntelligencePanel } from "./GpxIntelligencePanel"

interface RouteComparisonProps {
  routes: PlannedRoute[]
  selectedId: string
  /**
   * Selection callback for the whole comparison contract. `RouteComparison`
   * itself no longer selects anything — the decision rail does — but
   * `PlannerComposition` reads this off the same object to wire the rail, so
   * it stays on the type and is deliberately not destructured here.
   */
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
}

export function RouteComparison({
  routes,
  selectedId,
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
  onJoin
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
    const frame = window.requestAnimationFrame(() => {
      const identity = selectedRouteIdentityRef.current
      const scroll = identity?.closest<HTMLElement>(".planner-scroll")
      if (!identity || !scroll) return
      const identityBox = identity.getBoundingClientRect()
      const scrollBox = scroll.getBoundingClientRect()
      scroll.scrollTo({
        top: Math.max(0, scroll.scrollTop + identityBox.top - scrollBox.top - 8),
        behavior: "auto"
      })
    })
    return () => window.cancelAnimationFrame(frame)
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
          <h2 id="route-rack-title">Route details</h2>
          {selectedRoute ? (
            <p ref={selectedRouteIdentityRef} className="route-selection-identity">
              <span>Selected route</span>
              <strong>{selectedRoute.name}</strong>
            </p>
          ) : null}
        </div>
      </div>


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
        <p className="route-selection-prompt" role="status">Select a route to review its details and prepare your ride.</p>
      )}
    </section>
  )
}
