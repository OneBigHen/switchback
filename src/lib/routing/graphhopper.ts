import type { Coordinate, PlannedRoute, RouteProfileId, RouteRequest } from "./types"
import type { BikeProfile } from "./bike-profiles"
import { getProfile } from "./profiles"
import { analyzeGeometry, calculateDetailDistribution, type DetailInterval } from "./scoring"
import {
  disallowedSmoothness,
  disallowedSurfaces,
  disallowedTracktypes
} from "./bike-profiles"
import type { RoadLock } from "@/lib/roads/road-locks"
import {
  REGION_POLICY_OVERLAYS,
  type RegionPolicyOverlay
} from "./region-policy"
import { findRegionsContaining } from "@/lib/offline/region-catalog"

export interface GraphHopperOptions {
  baseUrl: string
  fetcher?: typeof fetch
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
const PREFER_LOCK_REWARD = "1.6"

/** A lock's geometry corridor rendered as a GraphHopper polygon feature. */
interface RoadLockAreaFeature {
  id: string
  polygon: Coordinate[]
}

function expandRoadLockGeometry(lock: RoadLock): Coordinate[] {
  return lock.geometry.coordinates.map((c) => [c[0], c[1]] as Coordinate)
}

function buildRoadLockAreaFeatures(locks: readonly RoadLock[]): {
  features: RoadLockAreaFeature[]
  closedPolygons: Coordinate[][]
} {
  const features: RoadLockAreaFeature[] = []
  const closedPolygons: Coordinate[][] = []
  locks.forEach((lock, index) => {
    const ring = expandRoadLockGeometry(lock)
    if (ring.length < 3) return
    const first = ring[0]!
    const last = ring[ring.length - 1]!
    const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]
    features.push({ id: `switchback_lock_${index}`, polygon: ring })
    closedPolygons.push(closed)
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
    if: `in_${feature.id}`,
    multiply_by: PREFER_LOCK_REWARD
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

/**
 * Region policy overlay rules. Speed multipliers convert to GraphHopper
 * `speed` statements; priority multipliers and exclusions become
 * `priority` statements. Each region overlay references a degenerate
 * area id so the `in_<region>` condition resolves consistently even
 * before the route touches the region's bounding box.
 */
function buildRegionOverlayRules(
  overlays: readonly RegionPolicyOverlay[]
): { rules: GraphHopperCustomModelRule[]; areas: { type: "FeatureCollection"; features: GraphHopperAreaFeature[] } | null } {
  if (overlays.length === 0) return { rules: [], areas: null }
  const rules: GraphHopperCustomModelRule[] = []
  const features: GraphHopperAreaFeature[] = []
  overlays.forEach((overlay, index) => {
    const id = `switchback_region_${index}`
    const degenerateRing: Coordinate[] = [[0, 0], [0, 0], [0, 0], [0, 0]]
    features.push({
      type: "Feature",
      id,
      geometry: { type: "Polygon", coordinates: [degenerateRing] }
    })
    if (overlay.customModel.speedMultipliers) {
      for (const [highwayClass, multiplier] of Object.entries(overlay.customModel.speedMultipliers)) {
        rules.push({
          if: `in_${id} && road_class == ${highwayClass.toUpperCase()}`,
          multiply_by: String(multiplier)
        })
      }
    }
    if (overlay.customModel.priorityMultipliers) {
      for (const [highwayClass, multiplier] of Object.entries(overlay.customModel.priorityMultipliers)) {
        rules.push({
          if: `in_${id} && road_class == ${highwayClass.toUpperCase()}`,
          multiply_by: String(multiplier)
        })
      }
    }
    if (overlay.customModel.excludeHighwayClasses) {
      for (const highwayClass of overlay.customModel.excludeHighwayClasses) {
        rules.push({
          if: `in_${id} && road_class == ${highwayClass.toUpperCase()}`,
          multiply_by: "0"
        })
      }
    }
    if (overlay.customModel.excludeSurfaces) {
      for (const surface of overlay.customModel.excludeSurfaces) {
        rules.push({
          if: `in_${id} && surface == ${surface.toUpperCase()}`,
          multiply_by: "0"
        })
      }
    }
  })
  return {
    rules,
    areas: features.length > 0 ? { type: "FeatureCollection", features } : null
  }
}

/**
 * Resolve every region-policy overlay whose source region contains any
 * of the request waypoints. Per §2.5, PA/WV/NJ/NY overlays tune speed,
 * priority, surface, and parkway behaviour at request time.
 */
function resolveRegionOverlaysForRequest(points: { lat: number; lon: number }[]): RegionPolicyOverlay[] {
  const matched = new Set<string>()
  for (const point of points) {
    for (const region of findRegionsContaining([point.lon, point.lat])) {
      matched.add(region.id)
    }
  }
  return REGION_POLICY_OVERLAYS.filter((overlay) => matched.has(overlay.regionId))
}

export function createGraphHopperRequest(_request: RouteRequest): Record<string, unknown> {
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
  const regionOverlays = resolveRegionOverlaysForRequest(_request.points)

  const mustLocks = roadLocks.filter((lock) => lock.mode === "must")
  const preferLocks = roadLocks.filter((lock) => lock.mode === "prefer")
  const mustAreas = buildRoadLockAreaFeatures(mustLocks)
  const preferAreas = buildRoadLockAreaFeatures(preferLocks)

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
  const regionRulesResult = buildRegionOverlayRules(regionOverlays)

  const highwayAvoidanceRule: GraphHopperCustomModelRule[] = _request.avoidHighways
    ? [{ if: "road_class == MOTORWAY || road_class == TRUNK", multiply_by: "0" }]
    : []

  const priorityRules: GraphHopperCustomModelRule[] = [
    ...highwayAvoidanceRule,
    ...areaFeatures.map((feature) => ({ if: `in_${feature.id}`, multiply_by: "0" })),
    ...mustRules,
    ...preferRules,
    ...bikeRules,
    ...regionRulesResult.rules
  ]

  const customModelAreasFeatures: GraphHopperAreaFeature[] = [
    ...areaFeatures,
    ...lockAreaFeatures,
    ...(regionRulesResult.areas?.features ?? [])
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
    details: ["road_class", "surface", "track_type", "max_speed"],
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
      "alternative_route.max_weight_factor": 1.8,
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
    routingSource: "live",
    previewOnly: false,
    loopTargetMinutes: request.roundTrip?.targetMinutes ?? request.loopTargetMinutes,
    avoidHighways: request.avoidHighways,
    avoidAreas: request.avoidAreas?.map((area) => ({ ...area, polygon: [...area.polygon] })),
    segmentProfiles: request.segmentProfiles ? [...request.segmentProfiles] : undefined
  }
}

export async function requestGraphHopperRoutes(
  request: RouteRequest,
  options: GraphHopperOptions
): Promise<GraphHopperResult> {
  const fetcher = options.fetcher ?? fetch
  let response: Response
  try {
    response = await fetcher(`${options.baseUrl.replace(/\/$/, "")}/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createGraphHopperRequest(request)),
      signal: AbortSignal.timeout(30_000)
    })
  } catch {
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

  if (!response.ok) {
    throw providerError(response.status, payload.message ?? response.statusText)
  }
  if (!payload.paths?.length) {
    throw providerError(422, payload.message ?? "No route was found")
  }

  return {
    engine: "graphhopper",
    engineVersion: "11.0",
    routes: payload.paths.map((path, index) => normalizePath(path, request, index))
  }
}
