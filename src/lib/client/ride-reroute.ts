import {
  buildRemainingRoutePoints,
  coordinateAtRouteDistance,
  coordinateDistanceMeters,
  type NavigationFrame,
  type NavigationModel
} from "@/lib/client/navigation-engine"
import { requestTripPlan } from "@/lib/client/routing-client"
import { recoverRouteFromOfflinePack } from "@/lib/client/offline-route-recovery"
import { recoverRouteFromInstalledRegions } from "@/lib/client/regional-offline-route"
import type { PlaceResult } from "@/lib/geocoding/photon"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"
import { OfflineRoutePackLibrary } from "@/lib/storage/offline-route-pack"

export type RideRerouteMode = "nearest-safe" | "next-shaping-point" | "skip-point" | "fuel-detour" | "automatic"

export type RerouteResolutionSource = "online" | "regional-offline" | "offline-pack"

export interface RerouteResolution {
  route: PlannedRoute
  source: RerouteResolutionSource
}

export interface RerouteRegionalResult {
  route: PlannedRoute | null
  error: string | null
}

export type RerouteOnlineResolver = (
  route: PlannedRoute,
  points: Waypoint[],
  signal: AbortSignal
) => Promise<PlannedRoute>

export type RerouteRegionalResolver = (
  route: PlannedRoute,
  points: Waypoint[],
  signal: AbortSignal
) => Promise<RerouteRegionalResult>

export type RerouteSavedPackResolver = (
  route: PlannedRoute,
  points: Waypoint[],
  signal: AbortSignal
) => Promise<PlannedRoute>

export interface RerouteResolutionDependencies {
  online: RerouteOnlineResolver
  regional: RerouteRegionalResolver
  saved: RerouteSavedPackResolver
}

export interface ResolveRerouteInput {
  route: PlannedRoute
  points: Waypoint[]
  signal: AbortSignal
  /** Defaults to the browser's current online state. */
  online?: boolean
  dependencies?: Partial<RerouteResolutionDependencies>
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason
  const error = new Error("Reroute was cancelled.")
  error.name = "AbortError"
  return error
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal)
}

async function requestOnlineReroute(
  route: PlannedRoute,
  points: Waypoint[],
  signal: AbortSignal
): Promise<PlannedRoute> {
  const plan = await requestTripPlan(
    {
      profile: route.profile,
      compare: false,
      avoidHighways: route.avoidHighways,
      avoidAreas: route.avoidAreas,
      points
    },
    fetch,
    signal
  )
  const rerouted = plan.routes.find((candidate) => candidate.id === plan.selectedRouteId) ?? plan.routes[0]
  if (!rerouted) throw new Error("The routing service returned no recovery line.")
  return rerouted
}

async function recoverRegionalReroute(
  route: PlannedRoute,
  points: Waypoint[],
  signal: AbortSignal
): Promise<RerouteRegionalResult> {
  return recoverRouteFromInstalledRegions(route, points, { signal })
}

async function recoverSavedPackReroute(
  route: PlannedRoute,
  points: Waypoint[],
  signal: AbortSignal
): Promise<PlannedRoute> {
  throwIfAborted(signal)
  const pack = await new OfflineRoutePackLibrary().get(`${route.id}-offline`)
  throwIfAborted(signal)
  if (!pack) throw new Error("No saved offline corridor is available for this route.")
  const recovered = recoverRouteFromOfflinePack(pack, points)
  if (!recovered.route) throw new Error(recovered.error ?? "Offline corridor recovery failed.")
  return recovered.route
}

/** Resolve a reroute through online, regional, then saved-pack sources. */
export async function resolveReroute({
  route,
  points,
  signal,
  online = typeof navigator === "undefined" || navigator.onLine !== false,
  dependencies = {}
}: ResolveRerouteInput): Promise<RerouteResolution> {
  throwIfAborted(signal)
  const resolveOnline = dependencies.online ?? requestOnlineReroute
  const resolveRegional = dependencies.regional ?? recoverRegionalReroute
  const resolveSaved = dependencies.saved ?? recoverSavedPackReroute

  if (online) {
    try {
      const rerouted = await resolveOnline(route, points, signal)
      return { route: rerouted, source: "online" }
    } catch (caught) {
      // An abort is cancellation, not permission to try a less authoritative
      // route source. Preserve the original error for the caller's guard.
      if (signal.aborted) throw caught
    }
  }

  throwIfAborted(signal)
  const regional = await resolveRegional(route, points, signal)
  throwIfAborted(signal)
  if (regional.route) return { route: regional.route, source: "regional-offline" }

  throwIfAborted(signal)
  const saved = await resolveSaved(route, points, signal)
  throwIfAborted(signal)
  return { route: saved, source: "offline-pack" }
}

interface BuildReroutePointsInput {
  route: PlannedRoute
  navigationModel: NavigationModel
  trustedFrame: NavigationFrame
  currentFrame: NavigationFrame
  completedWaypointIndexes: number[]
  mode: RideRerouteMode
  fuelStop?: PlaceResult
}

export function buildReroutePoints({
  route,
  navigationModel,
  trustedFrame,
  currentFrame,
  completedWaypointIndexes,
  mode,
  fuelStop
}: BuildReroutePointsInput): Waypoint[] | null {
  let points = buildRemainingRoutePoints(
    route,
    trustedFrame,
    currentFrame.rawCoordinate,
    completedWaypointIndexes
  )
  if (mode === "nearest-safe") {
    const lookAheadMeters = Math.max(300, (currentFrame.speedMetersPerSecond ?? 0) * 20)
    const rejoinCoordinate = coordinateAtRouteDistance(
      navigationModel,
      Math.min(navigationModel.totalDistanceMeters, trustedFrame.matchedDistanceMeters + lookAheadMeters)
    )
    const rejoinPoint = {
      lat: rejoinCoordinate[1],
      lon: rejoinCoordinate[0],
      label: "Nearest safe rejoin"
    }
    const firstRemaining = points[1]
    points = firstRemaining && coordinateDistanceMeters(
      [firstRemaining.lon, firstRemaining.lat],
      rejoinCoordinate
    ) <= 20
      ? [points[0]!, rejoinPoint, ...points.slice(2)]
      : [points[0]!, rejoinPoint, ...points.slice(1)]
  } else if (mode === "skip-point" && points.length > 2) {
    points = [points[0]!, ...points.slice(2)]
  } else if (mode === "fuel-detour") {
    if (!fuelStop) return null
    points = [points[0]!, {
      lat: fuelStop.lat,
      lon: fuelStop.lon,
      label: `Fuel · ${fuelStop.name}`
    }, ...points.slice(1)]
  }
  return points.length >= 2 ? points : null
}
