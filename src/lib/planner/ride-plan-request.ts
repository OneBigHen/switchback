import type { TripPlanRequest } from "@/lib/routing/planner"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import type { RoadLock } from "@/lib/roads/road-locks"
import type { AvoidArea, CandidateSet, Coordinate, RouteProfileId, TollPolicy, Waypoint } from "@/lib/routing/types"

interface BuildRideTripRequestOptions {
  mode: "destination" | "loop"
  start: Waypoint | null
  finish: Waypoint | null
  profile: RouteProfileId
  bikeProfile?: BikeProfile
  roadLocks?: RoadLock[]
  targetMinutes: number
  seed: number
  via?: Waypoint[]
  avoidHighways?: boolean
  avoidAreas?: AvoidArea[]
  segmentProfiles?: RouteProfileId[]
  tollPolicy?: TollPolicy
  planningId?: string
  candidateSet?: CandidateSet
}

/**
 * One UUID per planning lifecycle, shared by the primary and alternatives
 * calls. Falls back to a time-random id where `crypto.randomUUID` is not
 * available (e.g. non-secure LAN contexts).
 */
export function createPlanningId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function progressiveMetadata(options: Pick<BuildRideTripRequestOptions, "planningId" | "candidateSet">): Partial<TripPlanRequest> {
  return {
    ...(options.planningId ? { planningId: options.planningId } : {}),
    ...(options.candidateSet ? { candidateSet: options.candidateSet } : {})
  }
}

export function buildLoopStopVia(
  geometry: Coordinate[],
  stop: Waypoint
): Waypoint[] {
  if (geometry.length < 4) return [stop]
  const routeEnd = geometry.length - 1
  const firstAnchor = geometry[Math.floor(routeEnd * 0.25)]
  const secondAnchor = geometry[Math.floor(routeEnd * 0.75)]
  if (!firstAnchor || !secondAnchor) return [stop]
  return [
    { lat: firstAnchor[1], lon: firstAnchor[0], label: "Loop shape 1" },
    stop,
    { lat: secondAnchor[1], lon: secondAnchor[0], label: "Loop shape 2" }
  ]
}

export function buildRideTripRequest({
  mode,
  start,
  finish,
  profile,
  bikeProfile,
  roadLocks = [],
  targetMinutes,
  seed,
  via = [],
  avoidHighways = false,
  avoidAreas = [],
  segmentProfiles,
  tollPolicy,
  planningId,
  candidateSet
}: BuildRideTripRequestOptions): TripPlanRequest {
  if (!start) throw new Error("Choose a start point first.")
  const roadLocksPayload = roadLocks.length > 0 ? { roadLocks } : {}
  const bikeProfilePayload = bikeProfile ? { bikeProfile } : {}
  const progressive = progressiveMetadata({ planningId, candidateSet })
  if (mode === "destination") {
    if (!finish) throw new Error("Choose a finish point first.")
    return {
      profile,
      compare: true,
      points: [start, ...via, finish],
      ...(avoidHighways ? { avoidHighways: true } : {}),
      ...(avoidAreas.length > 0 ? { avoidAreas } : {}),
      ...(segmentProfiles ? { segmentProfiles } : {}),
      ...(tollPolicy ? { tollPolicy } : {}),
      ...(Number.isInteger(targetMinutes) && targetMinutes >= 20 && targetMinutes <= 480
        ? { targetMinutes }
        : {}),
      ...progressive,
      ...bikeProfilePayload,
      ...roadLocksPayload
    }
  }

  if (!Number.isInteger(targetMinutes) || targetMinutes < 20 || targetMinutes > 480) {
    throw new Error("Loop time must be between 20 minutes and 8 hours.")
  }
  const normalizedSeed = Math.max(0, Math.trunc(seed))
  if (via.length > 0) {
    return {
      profile,
      compare: true,
      points: [start, ...via, start],
      loopTargetMinutes: targetMinutes,
      ...(avoidHighways ? { avoidHighways: true } : {}),
      ...(avoidAreas.length > 0 ? { avoidAreas } : {}),
      ...(tollPolicy ? { tollPolicy } : {}),
      ...progressive,
      ...bikeProfilePayload,
      ...roadLocksPayload
    }
  }
  return {
    profile,
    compare: true,
    points: [start],
    ...(avoidHighways ? { avoidHighways: true } : {}),
    ...(avoidAreas.length > 0 ? { avoidAreas } : {}),
    ...(tollPolicy ? { tollPolicy } : {}),
    ...progressive,
    ...bikeProfilePayload,
    ...roadLocksPayload,
    // No `heading`: GraphHopper's round_trip + headings combination fails to
    // find a valid point in some areas (its "after 3 tries ... NaN" error),
    // surfacing as a generic "couldn't be routed" failure. The round_trip
    // seed already varies loop topology, so the heading is redundant.
    roundTrip: {
      targetMinutes,
      seed: normalizedSeed
    }
  }
}
