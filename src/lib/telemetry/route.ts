import type { TripPlanRequest } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"
import type {
  TelemetryCandidateRole,
  TelemetryCountBand,
  TelemetryDetourBand,
  TelemetryDistanceBand,
  TelemetryDurationBand,
  TelemetryFailureClass,
  TelemetryLatencyBand,
  TelemetryRouteMode,
  TelemetryRouteProperties,
  TelemetryRouteSource,
  TelemetrySurfaceMixBand
} from "./events"

const UNPAVED_SURFACES = new Set([
  "gravel", "fine_gravel", "compacted", "dirt", "earth", "ground", "unpaved",
  "sand", "mud", "grass", "sett", "cobblestone", "pebblestone", "rock"
])

export interface RouteTelemetryOptions {
  routeMode?: TelemetryRouteMode
  routeSource?: TelemetryRouteSource
  trafficEvidencePresent?: boolean
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function distanceBand(value: number | null): TelemetryDistanceBand {
  if (value === null || value < 0) return "unknown"
  if (value < 25) return "0-25mi"
  if (value < 75) return "25-75mi"
  if (value < 150) return "75-150mi"
  return "150+mi"
}

function durationBand(value: number | null): TelemetryDurationBand {
  if (value === null || value < 0) return "unknown"
  if (value < 30) return "0-30m"
  if (value < 90) return "30-90m"
  if (value < 180) return "90-180m"
  if (value < 360) return "180-360m"
  return "360m+"
}

function detourBand(value: number | null): TelemetryDetourBand {
  if (value === null || value < 0) return "unknown"
  if (value < 1) return "none"
  if (value < 10) return "0-10m"
  if (value < 30) return "10-30m"
  return "30m+"
}

export function telemetryCountBand(value: number | null): TelemetryCountBand {
  if (value === null || value < 0) return "unknown"
  if (value === 0) return "0"
  if (value === 1) return "1"
  if (value <= 3) return "2-3"
  return "4+"
}

function latencyBand(value: number | null): TelemetryLatencyBand {
  if (value === null || value < 0) return "unknown"
  if (value < 1_000) return "0-1s"
  if (value < 3_000) return "1-3s"
  if (value < 10_000) return "3-10s"
  return "10s+"
}

function providerSet(routes: readonly PlannedRoute[]): TelemetryRouteProperties["provider_set"] {
  const providers = new Set(routes.map((route) => route.provider).filter((provider): provider is "graphhopper" | "valhalla" => (
    provider === "graphhopper" || provider === "valhalla"
  )))
  if (providers.size === 2) return "graphhopper+valhalla"
  if (providers.has("graphhopper")) return "graphhopper"
  if (providers.has("valhalla")) return "valhalla"
  return "unknown"
}

function surfaceMixBand(route: PlannedRoute): TelemetrySurfaceMixBand {
  const entries = Object.entries(route.surfaceMix)
    .filter(([surface, share]) => surface.toLowerCase() !== "unknown" && Number.isFinite(share) && share > 0)
  if (entries.length === 0) return "unknown"
  const total = entries.reduce((sum, [, share]) => sum + share, 0)
  if (total <= 0) return "unknown"
  const scale = total <= 1.5 ? 100 : 1
  const unpavedShare = entries.reduce((sum, [surface, share]) => (
    UNPAVED_SURFACES.has(surface.toLowerCase()) ? sum + share * scale : sum
  ), 0)
  if (unpavedShare <= 10) return "mostly-paved"
  if (unpavedShare <= 50) return "mixed"
  return "mostly-unpaved"
}

function scoredBest(route: PlannedRoute, routes: readonly PlannedRoute[]): boolean {
  const score = finite(route.routeScore?.total)
  if (score === null) return false
  const otherScores = routes
    .filter((candidate) => candidate.id !== route.id)
    .map((candidate) => finite(candidate.routeScore?.total))
    .filter((candidate): candidate is number => candidate !== null)
  return otherScores.every((candidate) => score > candidate)
}

function candidateRole(route: PlannedRoute, routes: readonly PlannedRoute[]): TelemetryCandidateRole {
  if (route.navigationMode === "track-only" || route.routingSource === "imported") return "imported-track"
  if (route.corridorOption === "better-roads" || route.corridorOption === "leaner") return route.corridorOption
  if (scoredBest(route, routes)) return "best-ride"
  if (routes.length > 1 && route.durationMinutes === Math.min(...routes.map((candidate) => candidate.durationMinutes))) {
    return "fastest"
  }
  return route.profile
}

export function routeTelemetryMode(
  request: Pick<TripPlanRequest, "points" | "roundTrip" | "loopTargetMinutes">
): TelemetryRouteMode {
  if (request.roundTrip || request.loopTargetMinutes !== undefined) return "loop"
  if (request.points.length >= 2) return "destination"
  return "unknown"
}

export function routeRequestTelemetryProperties(
  request: Pick<TripPlanRequest, "points" | "roundTrip" | "loopTargetMinutes">,
  routeSource: TelemetryRouteSource
): Required<Pick<TelemetryRouteProperties, "route_mode" | "route_source" | "waypoint_count_band">> {
  return {
    route_mode: routeTelemetryMode(request),
    route_source: routeSource,
    waypoint_count_band: telemetryCountBand(request.points.length)
  }
}

export function routeTelemetryProperties(
  route: PlannedRoute,
  routes: readonly PlannedRoute[],
  options: RouteTelemetryOptions = {}
): TelemetryRouteProperties {
  const finiteDurations = routes
    .map((candidate) => finite(candidate.durationMinutes))
    .filter((value): value is number => value !== null)
  const fastestDuration = finiteDurations.length > 0 ? Math.min(...finiteDurations) : null
  const duration = finite(route.durationMinutes)
  return {
    ...(options.routeMode ? { route_mode: options.routeMode } : {}),
    ...(options.routeSource ? { route_source: options.routeSource } : {}),
    provider_set: providerSet(routes.length > 0 ? routes : [route]),
    distance_band: distanceBand(finite(route.distanceMiles)),
    duration_band: durationBand(duration),
    detour_band: detourBand(duration !== null && fastestDuration !== null ? duration - fastestDuration : null),
    waypoint_count_band: telemetryCountBand(route.waypoints.length),
    candidate_count: Math.min(20, routes.length > 0 ? routes.length : 1),
    surface_mix_band: surfaceMixBand(route),
    traffic_evidence_present: options.trafficEvidencePresent ?? false,
    selected_candidate_role: candidateRole(route, routes)
  }
}

export function latencyProperties(latencyMs: number | null | undefined): Pick<TelemetryRouteProperties, "latency_ms" | "latency_band"> {
  const latency = finite(latencyMs)
  return {
    latency_band: latencyBand(latency),
    ...(latency === null ? {} : { latency_ms: Math.round(latency) })
  }
}

export function telemetryFailureClass(code: string | undefined): TelemetryFailureClass {
  const normalized = code?.toLowerCase() ?? ""
  if (normalized.includes("abort") || normalized.includes("cancel")) return "cancelled"
  if (normalized.includes("missing") || normalized.includes("waypoint") || normalized.includes("input")) return "missing-input"
  if (normalized.includes("timeout") || normalized.includes("deadline")) return "provider-timeout"
  if (normalized.includes("unreachable") || normalized.includes("unavailable")) return "provider-unavailable"
  if (normalized.includes("invalid") || normalized.includes("malformed")) return "invalid-response"
  if (normalized.includes("no_route") || normalized.includes("no-route") || normalized.includes("noroute")) return "no-route"
  if (normalized.includes("storage") || normalized.includes("quota")) return "storage-failure"
  if (normalized.includes("parse") || normalized.includes("gpx")) return "parse-failure"
  if (normalized.includes("route_planning") || normalized.includes("provider") || normalized.includes("routing")) return "provider-failure"
  return "unknown"
}
