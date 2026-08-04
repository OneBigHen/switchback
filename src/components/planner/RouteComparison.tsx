"use client"

import {
  CaretDown,
  CaretUp,
  DownloadSimple,
  FloppyDisk,
  ListNumbers,
  NavigationArrow
} from "@phosphor-icons/react"
import { useState } from "react"
import Image from "next/image"
import type { PlannedRoute } from "@/lib/routing/types"
import { ManeuverGlyph } from "./maneuver-glyph"
import { maneuverKind } from "@/lib/client/maneuver"
import { RoadLockSatisfactionBadge } from "./RoadLockSatisfactionBadge"
import { RouteDataQualityPanel } from "./RouteDataQualityPanel"
import { RouteWeatherPanel } from "./RouteWeatherPanel"
import { TripStagePanel } from "./TripStagePanel"
import { RouteRating } from "./RouteRating"
import { RouteSharePanel } from "./RouteSharePanel"
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
}

function dominantMix(mix: Record<string, number>): string {
  const dominant = Object.entries(mix).sort((left, right) => right[1] - left[1])[0]
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

function hasSkippedPreferLock(route: PlannedRoute): RoadLockSatisfaction | undefined {
  return route.lockSatisfaction?.find((row) => row.mode === "prefer" && Boolean(row.skippedReason))
}

function formatUnknownSurfaceMiles(route: PlannedRoute): string | null {
  const surfaceEntries = Object.entries(route.surfaceMix)
  const surfaceTotal = surfaceEntries.reduce((sum, [, share]) => sum + share, 0)
  if (surfaceTotal <= 0 || route.distanceMiles <= 0) return null
  const unknown = surfaceEntries
    .filter(([surface]) => surface.toLowerCase() === "unknown")
    .reduce((sum, [, share]) => sum + (share / surfaceTotal) * route.distanceMiles, 0)
  if (unknown <= 0) return null
  return unknown.toFixed(1)
}

function routeReason(route: PlannedRoute): string {
  switch (route.profile) {
    case "quick":
      return "Lowest travel time"
    case "twisty":
      return "Most curves and direction changes"
    case "scenic":
      return "Balanced for back roads and views"
    case "adventure":
      return "Targets gravel and unpaved roads"
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
  replayComparison
}: RouteComparisonProps) {
  const [directionsOpen, setDirectionsOpen] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [exportVariant, setExportVariant] = useState<GpxExportVariant>("track")
  const [dismissedMustLockIds, setDismissedMustLockIds] = useState<string[]>([])
  const selectedRoute = routes.find((route) => route.id === selectedId) ?? routes[0]
  if (!selectedRoute) return null

  return (
    <section className="route-rack" aria-labelledby="route-rack-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Your options</span>
          <h2 id="route-rack-title">Choose a route</h2>
        </div>
        <span className="route-count">{routes.length.toString().padStart(2, "0")}</span>
      </div>

      <div className="route-slips">
        {routes.map((route, index) => {
          const selected = route.id === selectedId
          const officialUnpaved = officialUnpavedLabel(route)
          const unknownSurfaceLabel = formatUnknownSurfaceMiles(route)
          const skippedSatisfaction = hasSkippedPreferLock(route)
          return (
            <button
              className={`route-slip${selected ? " is-selected" : ""}`}
              type="button"
              key={route.id}
              aria-label={`Select ${route.name}`}
              aria-pressed={selected}
              onClick={() => onSelect(route.id)}
            >
              <span className="route-slip-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="route-slip-body">
                <span className="route-slip-name">
                  <strong>{route.name}</strong>
                  <small>{routeReason(route)}</small>
                </span>
                <span className="route-character">
                  <span>{dominantMix(route.roadMix)}</span>
                  <span>{unpavedPercent(route.surfaceMix)}% unpaved</span>
                  {unknownSurfaceLabel ? (
                    <span className="route-character-unknown">~{unknownSurfaceLabel} mi unknown surface</span>
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
                  <strong>{route.distanceMiles.toFixed(1)}</strong>
                  <small>miles</small>
                </span>
                <span className="route-slip-metric">
                  <strong>{Math.round(route.durationMinutes)}</strong>
                  <small>min</small>
                </span>
                <span className="route-slip-metric twistiness-meter">
                  <strong>{Math.round(route.twistiness)}</strong>
                  <small>twist</small>
                </span>
              </span>
            </button>
          )
        })}
      </div>

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
                      <b className="directions-distance">{
                        instruction.distanceMeters < 1_000
                          ? `${Math.max(1, Math.round(instruction.distanceMeters))} m`
                          : `${(instruction.distanceMeters / 1_609.344).toFixed(1)} mi`
                      }</b>
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
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen((open) => !open)}
      >
        {detailsOpen ? "Hide route details" : "Show route details"}
      </button>

      {detailsOpen ? <>
      <div className="route-scenic-gallery" aria-label="Route character previews">
        <Image src="/assets/scenic/ridge-overlook.webp" alt="Appalachian ridge road overlook" width={720} height={480} />
        <Image src="/assets/scenic/autumn-switchback.webp" alt="Autumn mountain switchback" width={720} height={480} />
        <Image src="/assets/scenic/roadside-coffee.webp" alt="Roadside motorcycle coffee stop" width={720} height={480} />
      </div>
      <RouteDataQualityPanel route={selectedRoute} sourceMapUpdated={sourceMapUpdated ?? null} />

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

      <div className="route-actions" aria-label="Selected route actions">
        <button type="button" className="tool-button" onClick={() => onSave(selectedRoute)}>
          <FloppyDisk aria-hidden="true" />
          <span>Save route</span>
        </button>
        <label className="gpx-export-variant">
          <span>GPX format</span>
          <select aria-label="GPX export format" value={exportVariant} onChange={(event) => setExportVariant(event.currentTarget.value as GpxExportVariant)}>
            <option value="track">Track</option>
            <option value="route">Route</option>
            <option value="cues">Cues</option>
          </select>
        </label>
        <button type="button" className="tool-button" onClick={() => onExport(selectedRoute, exportVariant)}>
          <DownloadSimple aria-hidden="true" />
          <span>Export GPX</span>
        </button>
        {showRideAction ? (
          <button type="button" className="ride-button" onClick={() => onRide(selectedRoute)}>
            <NavigationArrow weight="fill" aria-hidden="true" />
            <span>Start ride</span>
          </button>
        ) : null}
      </div>
      </> : null}
    </section>
  )
}
