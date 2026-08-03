import type { Coordinate, PlannedRoute, RouteProfileId, RouteRequest } from "./types"
import type { BikeProfile } from "./bike-profiles"
import { getProfile } from "./profiles"
import { analyzeGeometry, calculateDetailDistribution, curvedDistanceShare, type DetailInterval } from "./scoring"
import {
  disallowedSmoothness,
  disallowedSurfaces,
  disallowedTracktypes
} from "./bike-profiles"
import type { RoadLock } from "@/lib/roads/road-locks"

export interface GraphHopperOptions {
  baseUrl: string
  fetcher?: typeof fetch
  /** Lifecycle cancellation signal, combined with the request timeout. */
  signal?: AbortSignal
}

export interface GraphHopperResult {
  engine: "graphhopper"
  engineVersion: string
  routes: PlannedRoute[]
}

export class GraphHopperProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
  }
}

/** AbortError travels across runtimes/realms, so check the name, not the class. */
function isAbortError(caught: unknown): boolean {
  return caught !== null && typeof caught === "object"
    && (caught as { name?: unknown }).name === "AbortError"
}

const ROUND_TRIP_SPEED_MPH: Record<RouteProfileId, number> = {
  quick: 48,
  twisty: 38,
  scenic: 34,
  adventure: 28
}

export function estimateRoundTripDistanceMeters(
  profile: RouteProfileId,
  targetMinutes: number
): number {
  const boundedMinutes = Math.max(20, Math.min(480, targetMinutes))
  return Math.round(ROUND_TRIP_SPEED_MPH[profile] * boundedMinutes / 60 * 1609.344)
}

/**
 * GraphHopper custom_model priority statement. Kept loose so callers can
 * compose must/prefer/bike/region rules without depending on a strict
 * GraphQL-shaped type that GraphHopper 11 still accepts via JSON.
 */
interface GraphHopperCustomModelRule {
  if?: string
  else?: string
  multiply_by?: string
  to?: string
  limit_to?: string
}

/** GraphHopper FeatureCollection area wrapper used by custom_model priority rules. */
interface GraphHopperAreaFeature {
  type: "Feature"
  id: string
  geometry: {
    type: "Polygon"
    coordinates: Coordinate[][]
  }
}

interface GraphHopperCustomModel {
  priority?: GraphHopperCustomModelRule[]
  speed?: GraphHopperCustomModelRule[]
  areas?: {
    type: "FeatureCollection"
    features: GraphHopperAreaFeature[]
  }
}

const MUST_LOCK_PRIORITY_ZERO = "0"
// This GraphHopper deployment caps custom-model priority multipliers at 1.
// Penalizing edges outside the corridor by the inverse of the old 1.6 reward
// preserves the same relative preference without producing an invalid model.
const PREFER_LOCK_OUTSIDE_PENALTY = "0.625"

/** A lock's geometry corridor rendered as a GraphHopper polygon feature. */
interface RoadLockAreaFeature {
  id: string
  polygon: Coordinate[]
}

const METERS_PER_DEGREE_LATITUDE = 111_320

/**
 * Build a thin closed corridor around a lock's LineString using its
 * fallback tolerance. The result is a closed ring (first coord ==
 * last coord) so GraphHopper's `in_<area>` condition can resolve it
 * as a polygon mask for must/prefer custom_model rules.
 */
function bufferLineStringToPolygon(
  coordinates: Coordinate[],
  toleranceMeters: number
): Coordinate[] {
  if (coordinates.length < 2) return []
  const tolerance = Math.max(toleranceMeters, 5)
  const left: Coordinate[] = []
  const right: Coordinate[] = []
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const [lonA, latA] = coordinates[index]!
    const [lonB, latB] = coordinates[index + 1]!
    const deltaLon = lonB - lonA
    const deltaLat = latB - latA
    const length = Math.hypot(deltaLon, deltaLat)
    if (length === 0) continue
    // Perpendicular direction adjusted for latitude so degrees are
    // roughly isotropic at the lock's location.
    const cosLat = Math.cos((latA * Math.PI) / 180) || 1
    const scale = tolerance / METERS_PER_DEGREE_LATITUDE
    const perpLon = (-deltaLat / length) * (scale / cosLat)
    const perpLat = (deltaLon / length) * scale
    if (left.length === 0) left.push([lonA + perpLon, latA + perpLat])
    left.push([lonB + perpLon, latB + perpLat])
    if (right.length === 0) right.push([lonA - perpLon, latA - perpLat])
    right.push([lonB - perpLon, latB - perpLat])
  }
  if (left.length === 0 || right.length === 0) return []
  const ring: Coordinate[] = [...left, ...right.reverse(), left[0]!]
  return ring
}

function expandRoadLockGeometry(lock: RoadLock): Coordinate[] {
  return lock.geometry.coordinates.map((c) => [c[0], c[1]] as Coordinate)
}

function buildRoadLockAreaFeatures(locks: readonly RoadLock[], idOffset = 0): {
  features: RoadLockAreaFeature[]
  closedPolygons: Coordinate[][]
} {
  const features: RoadLockAreaFeature[] = []
  const closedPolygons: Coordinate[][] = []
  locks.forEach((lock, index) => {
    const sourceLine = expandRoadLockGeometry(lock)
    const polygon = bufferLineStringToPolygon(sourceLine, lock.fallbackToleranceMeters)
    if (polygon.length < 4) return
    const id = `switchback_lock_${idOffset + index}`
    features.push({ id, polygon })
    closedPolygons.push(polygon)
  })
  return { features, closedPolygons }
}

function buildMustLockRules(features: readonly RoadLockAreaFeature[]): GraphHopperCustomModelRule[] {
  return features.map((feature) => ({
    if: `!in_${feature.id}`,
    multiply_by: MUST_LOCK_PRIORITY_ZERO
  }))
}

function buildPreferLockRules(features: readonly RoadLockAreaFeature[]): GraphHopperCustomModelRule[] {
  return features.map((feature) => ({
    if: `!in_${feature.id}`,
    multiply_by: PREFER_LOCK_OUTSIDE_PENALTY
  }))
}

/** Bike-profile rules per §3: surface/smoothness/tracktype exclusions and penalties. */
function buildBikeProfileRules(profile: BikeProfile): GraphHopperCustomModelRule[] {
  const rules: GraphHopperCustomModelRule[] = []
  const surfaces = disallowedSurfaces(profile)
  const smoothness = disallowedSmoothness(profile)
  const tracktypes = disallowedTracktypes(profile)

  if (surfaces.size > 0) {
    const condition = [...surfaces].map((s) => `surface == ${String(s).toUpperCase()}`).join(" || ")
    rules.push({ if: condition, multiply_by: "0" })
  }
  if (smoothness.size > 0) {
    const condition = [...smoothness].map((s) => `smoothness == ${String(s).toUpperCase()}`).join(" || ")
    rules.push({ if: condition, multiply_by: "0" })
  }
  if (tracktypes.size > 0) {
    const condition = [...tracktypes].map((t) => `track_type == ${String(t).toUpperCase()}`).join(" || ")
    rules.push({ if: condition, multiply_by: "0" })
  }
  if (profile.category === "street" || profile.category === "touring") {
    rules.push({ if: "road_class == PATH", multiply_by: "0" })
  }
  return rules
}

export function createGraphHopperRequest(
  _request: RouteRequest,
  details: string[] = REQUESTED_DETAILS
): Record<string, unknown> {
  const profile = getProfile(_request.profile)
  if (_request.roundTrip && _request.points.length !== 1) {
    throw new Error("A round trip requires exactly one start point")
  }
  if (!_request.roundTrip && _request.points.length < 2) {
    throw new Error("A route requires at least two waypoints")
  }
  const avoidAreas = _request.avoidAreas ?? []
  const areaFeatures: GraphHopperAreaFeature[] = avoidAreas.map((area, index) => {
    const id = `switchback_avoid_${index}`
    const first = area.polygon[0]
    const last = area.polygon.at(-1)
    const closed = first && (!last || first[0] !== last[0] || first[1] !== last[1])
      ? [...area.polygon, first]
      : area.polygon
    return {
      type: "Feature",
      id,
      geometry: { type: "Polygon", coordinates: [closed] }
    }
  })

  const roadLocks = _request.roadLocks ?? []
  const bikeProfile = _request.bikeProfile

  const mustLocks = roadLocks.filter((lock) => lock.mode === "must")
  const preferLocks = roadLocks.filter((lock) => lock.mode === "prefer")
  const mustAreas = buildRoadLockAreaFeatures(mustLocks, 0)
  const preferAreas = buildRoadLockAreaFeatures(preferLocks, mustAreas.features.length)

  const lockAreaFeatures: GraphHopperAreaFeature[] = []
  ;[...mustAreas.features, ...preferAreas.features].forEach((feature, index) => {
    const ring = [...mustAreas.closedPolygons, ...preferAreas.closedPolygons][index] ?? feature.polygon
    lockAreaFeatures.push({
      type: "Feature",
      id: feature.id,
      geometry: { type: "Polygon", coordinates: [ring] }
    })
  })
  const mustRules = buildMustLockRules(mustAreas.features)
  const preferRules = buildPreferLockRules(preferAreas.features)
  const bikeRules = bikeProfile ? buildBikeProfileRules(bikeProfile) : []

  // Explicit toll avoidance stays a request-time zero-priority rule; the
  // persistent profiles penalize tolls without excluding them by default.
  const tollAvoidanceRule: GraphHopperCustomModelRule[] = _request.tollPolicy === "avoid"
    ? [{ if: "toll == ALL", multiply_by: "0" }]
    : []

  const highwayAvoidanceRule: GraphHopperCustomModelRule[] = _request.avoidHighways
    ? [{ if: "road_class == MOTORWAY || road_class == TRUNK", multiply_by: "0" }]
    : []

  const priorityRules: GraphHopperCustomModelRule[] = [
    ...highwayAvoidanceRule,
    ...tollAvoidanceRule,
    ...areaFeatures.map((feature) => ({ if: `in_${feature.id}`, multiply_by: "0" })),
    ...mustRules,
    ...preferRules,
    ...bikeRules
  ]

  const customModelAreasFeatures: GraphHopperAreaFeature[] = [
    ...areaFeatures,
    ...lockAreaFeatures
  ]

  const hasCustomModelContent =
    priorityRules.length > 0 || customModelAreasFeatures.length > 0
  const customModel: GraphHopperCustomModel | null = hasCustomModelContent
    ? {
        priority: priorityRules,
        ...(customModelAreasFeatures.length > 0 ? {
          areas: {
            type: "FeatureCollection",
            features: customModelAreasFeatures
          }
        } : {})
      }
    : null

  const baseRequest: Record<string, unknown> = {
    profile: profile.engineProfile,
    points: _request.points.map((point) => [point.lon, point.lat]),
    points_encoded: false,
    instructions: true,
    calc_points: true,
    elevation: false,
    locale: "en-US",
    details,
    ...(customModel ? { custom_model: customModel } : {})
  }
  if (_request.roundTrip) {
    return {
      ...baseRequest,
      algorithm: "round_trip",
      "round_trip.distance": estimateRoundTripDistanceMeters(
        _request.profile,
        _request.roundTrip.targetMinutes
      ),
      "round_trip.seed": _request.roundTrip.seed ?? 0,
      ...(_request.roundTrip.heading === undefined
        ? {}
        : { headings: [_request.roundTrip.heading] })
    }
  }
  if (_request.points.length === 2) {
    return {
      ...baseRequest,
      algorithm: "alternative_route",
      "alternative_route.max_paths": 3,
      // Timeboxed destination corridors need the engine to explore much
      // longer detours than a 1.8x ceiling allows; widen it so a swung
      // corridor can actually reach the requested duration.
      "alternative_route.max_weight_factor": _request.targetMinutes ? 4.0 : 1.8,
      "alternative_route.max_share_factor": 0.62
    }
  }
  return baseRequest
}

interface GraphHopperInstruction {
  distance?: number
  time?: number
  sign?: number
  text?: string
  street_name?: string
  interval?: [number, number]
}

interface GraphHopperPath {
  distance?: number
  time?: number
  ascend?: number
  descend?: number
  points?: { coordinates?: [number, number][] }
  snapped_waypoints?: { coordinates?: [number, number][] }
  instructions?: GraphHopperInstruction[]
  details?: Record<string, DetailInterval[]>
}

interface GraphHopperResponse {
  message?: string
  info?: { version?: string }
  paths?: GraphHopperPath[]
}

function providerError(status: number, message: string): GraphHopperProviderError {
  const normalized = message.toLowerCase()
  const outOfCoverage =
    normalized.includes("out of bounds") ||
    normalized.includes("cannot find point") ||
    normalized.includes("not found in graph")
  if (outOfCoverage) {
    return new GraphHopperProviderError(
      `One or more waypoints are outside the installed routing region. ${message}`,
      "OUT_OF_COVERAGE",
      status
    )
  }
  if (status >= 500) {
    return new GraphHopperProviderError(
      `The routing engine is unavailable. ${message}`,
      "PROVIDER_UNAVAILABLE",
      status
    )
  }
  return new GraphHopperProviderError(
    `The routing engine rejected this trip. ${message}`,
    "ROUTING_REJECTED",
    status
  )
}

function lookupSpeedLimit(
  interval: [number, number] | undefined,
  details: DetailInterval[]
): number | null {
  if (!interval || details.length === 0) return null
  const [from, to] = interval
  const midpoint = Math.floor((from + to) / 2)
  for (const [detailFrom, detailTo, value] of details) {
    if (midpoint >= detailFrom && midpoint < detailTo) {
      const speed = Number(value)
      return Number.isFinite(speed) && speed > 0 ? speed : null
    }
  }
  return null
}

/**
 * Toll evidence from GraphHopper's `toll` route detail. Missing detail stays
 * `known: false` with a null share — never a falsely clean "no toll".
 * GraphHopper's toll enum reports `ALL` for tolled edges (and `NO` /
 * `UNKNOWN` for the rest).
 */
function tollEvidence(
  geometry: Coordinate[],
  details: DetailInterval[] | undefined
): PlannedRoute["tollEvidence"] {
  if (!details || details.length === 0) {
    return { known: false, tollSharePercent: null }
  }
  const distribution = calculateDetailDistribution(geometry, details)
  const tolledShare = (distribution.ALL ?? 0) / 100
  return { known: true, tollSharePercent: Number((tolledShare * 100).toFixed(1)) }
}

export function createRouteId(
  profile: RouteProfileId,
  geometry: Coordinate[],
  index: number
): string {
  const fingerprint = geometry
    .map(([longitude, latitude]) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`)
    .join(";")
  let hash = 2166136261
  for (let cursor = 0; cursor < fingerprint.length; cursor += 1) {
    hash ^= fingerprint.charCodeAt(cursor)
    hash = Math.imul(hash, 16777619)
  }
  return `${profile}-${index + 1}-${(hash >>> 0).toString(36)}`
}

function normalizePath(
  path: GraphHopperPath,
  request: RouteRequest,
  index: number
): PlannedRoute {
  const geometry = path.points?.coordinates
  if (!geometry || geometry.length < 2) {
    throw new GraphHopperProviderError(
      "GraphHopper returned no routable road geometry",
      "INVALID_PROVIDER_RESPONSE",
      502
    )
  }

  const analysis = analyzeGeometry(geometry)
  const snapped = path.snapped_waypoints?.coordinates
  const waypoints = request.points.map((point, waypointIndex) => ({
    lat: snapped?.[waypointIndex]?.[1] ?? point.lat,
    lon: snapped?.[waypointIndex]?.[0] ?? point.lon,
    label: point.label
  }))
  if (request.roundTrip && waypoints[0]) waypoints.push({ ...waypoints[0] })
  const profile = getProfile(request.profile)

  const maxSpeedDetails = path.details?.max_speed ?? []

  return {
    id: createRouteId(request.profile, geometry, index),
    name: index === 0 ? `${profile.label} route` : `${profile.label} alternative ${index + 1}`,
    profile: request.profile,
    geometry,
    waypoints,
    instructions: (path.instructions ?? []).map((instruction) => ({
      distanceMeters: instruction.distance ?? 0,
      timeMilliseconds: instruction.time ?? 0,
      sign: instruction.sign ?? 0,
      text: instruction.text ?? "Continue",
      streetName: instruction.street_name ?? "",
      interval: instruction.interval ?? [0, 0],
      speedLimitKmh: lookupSpeedLimit(instruction.interval, maxSpeedDetails)
    })),
    distanceMiles: Number((((path.distance ?? 0) / 1609.344)).toFixed(2)),
    durationMinutes: Number((((path.time ?? 0) / 60000)).toFixed(2)),
    ascentMeters: path.ascend ?? null,
    descentMeters: path.descend ?? null,
    twistiness: analysis.twistiness,
    turnCount: analysis.turnCount,
    roadMix: calculateDetailDistribution(geometry, path.details?.road_class ?? []),
    surfaceMix: calculateDetailDistribution(geometry, path.details?.surface ?? []),
    roadEnvironmentMix: calculateDetailDistribution(geometry, path.details?.road_environment ?? []),
    urbanDensityMix: calculateDetailDistribution(geometry, path.details?.urban_density ?? []),
    curvatureDetailShare: curvedDistanceShare(geometry, path.details?.curvature),
    tollEvidence: tollEvidence(geometry, path.details?.toll),
    routingSource: "live",
    previewOnly: false,
    loopTargetMinutes: request.roundTrip?.targetMinutes ?? request.loopTargetMinutes,
    avoidHighways: request.avoidHighways,
    avoidAreas: request.avoidAreas?.map((area) => ({ ...area, polygon: [...area.polygon] })),
    segmentProfiles: request.segmentProfiles ? [...request.segmentProfiles] : undefined
  }
}

const REQUESTED_DETAILS = [
  "road_class", "surface", "track_type", "max_speed", "toll", "road_environment", "urban_density", "curvature"
]

interface RouteFetchResult {
  response: Response
  payload: GraphHopperResponse
  /** Detail name the active graph cannot serve, when the request was rejected. */
  unsupportedDetail: string | null
}

async function fetchRouteOnce(
  request: RouteRequest,
  options: GraphHopperOptions,
  details: string[]
): Promise<RouteFetchResult> {
  const fetcher = options.fetcher ?? fetch
  let response: Response
  try {
    response = await fetcher(`${options.baseUrl.replace(/\/$/, "")}/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createGraphHopperRequest(request, details)),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000)
    })
  } catch (caught) {
    if (isAbortError(caught)) {
      throw new GraphHopperProviderError(
        "Route planning was cancelled.",
        "ROUTE_CANCELLED",
        499
      )
    }
    throw new GraphHopperProviderError(
      "Cannot reach the routing engine. Check that GraphHopper is running and try again.",
      "PROVIDER_UNAVAILABLE",
      503
    )
  }

  let payload: GraphHopperResponse
  try {
    payload = (await response.json()) as GraphHopperResponse
  } catch {
    throw new GraphHopperProviderError(
      "GraphHopper returned an unreadable response",
      "INVALID_PROVIDER_RESPONSE",
      502
    )
  }

  const missingDetail = response.ok
    ? null
    : payload.message?.match(/Cannot find the path details: \[([^\]]+)\]/)?.[1] ?? null
  return { response, payload, unsupportedDetail: missingDetail }
}

export async function requestGraphHopperRoutes(
  request: RouteRequest,
  options: GraphHopperOptions
): Promise<GraphHopperResult> {
  // The active graph may predate an encoded-value change (e.g. the Phase 3
  // `toll` value). Retry once without the unsupported detail so a rolled-back
  // or not-yet-reimported graph degrades to missing evidence instead of
  // failing every route; the evidence fields already handle absence.
  let attempt = await fetchRouteOnce(request, options, REQUESTED_DETAILS)
  if (attempt.unsupportedDetail) {
    const degraded = REQUESTED_DETAILS.filter((detail) => detail !== attempt.unsupportedDetail)
    attempt = await fetchRouteOnce(request, options, degraded)
  }

  if (!attempt.response.ok) {
    throw providerError(attempt.response.status, attempt.payload.message ?? attempt.response.statusText)
  }
  const payload = attempt.payload
  if (!payload.paths?.length) {
    throw providerError(422, payload.message ?? "No route was found")
  }

  return {
    engine: "graphhopper",
    engineVersion: payload.info?.version ?? "11.0",
    routes: payload.paths.map((path, index) => normalizePath(path, request, index))
  }
}
