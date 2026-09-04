import type { Coordinate, RouteProfileId, TollPolicy, Waypoint } from "@/lib/routing/types"
import { haversine } from "@/lib/routing/scoring"
import type { ProposedRide, ProposedStop } from "./contracts"
import { routeProgressOf } from "./toolbox"

export interface AdvisorPlannerHandoff {
  mode: ProposedRide["mode"]
  points: {
    start: Waypoint
    finish: Waypoint | null
    via: Waypoint[]
  }
  profile: RouteProfileId
  targetMinutes: number | null
  timeShaped: boolean
  avoidHighways: boolean
  tollPolicy: TollPolicy
}

function waypoint(point: { name: string; lat: number; lon: number }): Waypoint {
  return { lat: point.lat, lon: point.lon, label: point.name }
}

/**
 * Convert an advisor proposal into one immutable planner handoff.
 *
 * React state mirrors these fields for editing, but the first route request must
 * not depend on those state setters having committed yet. The request caller
 * receives the exact values the rider confirmed on the advisor card.
 */
export function advisorRideToPlannerHandoff(ride: ProposedRide): AdvisorPlannerHandoff {
  return {
    mode: ride.mode,
    points: {
      start: waypoint(ride.start),
      finish: ride.mode === "destination" && ride.finish ? waypoint(ride.finish) : null,
      via: ride.waypoints.map(waypoint)
    },
    profile: ride.profile,
    targetMinutes: ride.targetMinutes,
    timeShaped: ride.mode === "loop" || ride.targetMinutes !== null,
    avoidHighways: ride.avoidHighways,
    tollPolicy: ride.tollPolicy
  }
}

const SAME_STOP_METERS = 25

/**
 * Add an advisor stop without erasing rider-authored shaping points.
 * Existing points keep their labels/lock state; the new stop is inserted in
 * route order when progress can be estimated. A point already within 25 m is
 * considered the same stop and is left untouched.
 */
export function mergeAdvisorStopIntoVia(
  existing: readonly Waypoint[],
  stop: ProposedStop,
  geometry: readonly Coordinate[]
): Waypoint[] {
  const stopCoordinate: Coordinate = [stop.anchor.lon, stop.anchor.lat]
  if (existing.some((point) =>
    haversine([point.lon, point.lat], stopCoordinate) <= SAME_STOP_METERS)) {
    return [...existing]
  }

  const incoming: Waypoint = {
    lat: stop.anchor.lat,
    lon: stop.anchor.lon,
    label: stop.name
  }
  if (geometry.length < 2) return [...existing, incoming]

  const progress = (point: Waypoint): number =>
    routeProgressOf({ lat: point.lat, lon: point.lon }, geometry) ?? 1
  const incomingProgress = stop.routeProgress ?? progress(incoming)
  const entries = [
    ...existing.map((point, index) => ({ point, progress: progress(point), index })),
    { point: incoming, progress: incomingProgress, index: existing.length }
  ]
  entries.sort((left, right) => left.progress - right.progress || left.index - right.index)
  return entries.map((entry) => entry.point)
}
