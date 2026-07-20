import type { TripPlanRequest } from "@/lib/routing/planner"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import type { RoadLock } from "@/lib/roads/road-locks"
import type { AvoidArea, Coordinate, RouteProfileId, Waypoint } from "@/lib/routing/types"

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
  segmentProfiles
}: BuildRideTripRequestOptions): TripPlanRequest {
  if (!start) throw new Error("Choose a start point first.")
  const roadLocksPayload = roadLocks.length > 0 ? { roadLocks } : {}
  const bikeProfilePayload = bikeProfile ? { bikeProfile } : {}
  if (mode === "destination") {
    if (!finish) throw new Error("Choose a finish point first.")
    return {
      profile,
      compare: true,
      points: [start, ...via, finish],
      ...(avoidHighways ? { avoidHighways: true } : {}),
      ...(avoidAreas.length > 0 ? { avoidAreas } : {}),
      ...(segmentProfiles ? { segmentProfiles } : {}),
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
    ...bikeProfilePayload,
    ...roadLocksPayload,
    roundTrip: {
      targetMinutes,
      seed: normalizedSeed,
      heading: normalizedSeed % 360
    }
  }
}
