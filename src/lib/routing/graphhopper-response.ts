import type { Coordinate, PlannedRoute, RouteProfileId } from "./types"
import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import { getProfile } from "./profiles"
import { analyzeGeometry, calculateDetailDistribution, curvedDistanceShare, type DetailInterval } from "./scoring"
import { featureProvenanceForPlannedRoute, scorePlannedRoute } from "@/lib/recommendation/route-candidate"
import { sketchCorridorContext } from "./sketch-corridor"

export class GraphHopperProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
  }
}

export interface GraphHopperInstruction {
  distance?: number
  time?: number
  sign?: number
  text?: string
  street_name?: string
  interval?: [number, number]
}

export interface GraphHopperPath {
  distance?: number
  time?: number
  ascend?: number
  descend?: number
  points?: { coordinates?: [number, number][] }
  snapped_waypoints?: { coordinates?: [number, number][] }
  instructions?: GraphHopperInstruction[]
  details?: Record<string, DetailInterval[]>
}

export interface GraphHopperResponse {
  message?: string
  info?: { version?: string }
  paths?: GraphHopperPath[]
}

export function normalizeGraphHopperProviderError(status: number, message: string): GraphHopperProviderError {
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

export function normalizeGraphHopperPath(
  path: GraphHopperPath,
  request: NormalizedRouteRequest,
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
  // SB-014: when must-use locks expanded the wire points, drop the injected
  // anchors so the route carries only the rider's original waypoints (mapped
  // to the correct snapped position via the wire index).
  const viaMap = request.lockViaWireToOriginal
  const waypoints = (viaMap && viaMap.length > 0
    ? viaMap
        .map((originalIndex, wireIndex) => ({ originalIndex, wireIndex }))
        .filter((entry) => entry.originalIndex >= 0)
        .sort((a, b) => a.originalIndex - b.originalIndex)
        .map(({ wireIndex }) => {
          const point = request.points[wireIndex]!
          return {
            lat: snapped?.[wireIndex]?.[1] ?? point.lat,
            lon: snapped?.[wireIndex]?.[0] ?? point.lon,
            label: point.label
          }
        })
    : request.points.map((point, waypointIndex) => ({
        lat: snapped?.[waypointIndex]?.[1] ?? point.lat,
        lon: snapped?.[waypointIndex]?.[0] ?? point.lon,
        label: point.label
      })))
  if (request.roundTrip && waypoints[0]) waypoints.push({ ...waypoints[0] })
  const profile = getProfile(request.profile)

  const maxSpeedDetails = path.details?.max_speed ?? []

  const normalized: PlannedRoute = {
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
    candidateSource: request.roundTrip
      ? "loop-seed"
      : request.points.length === 2
        ? index === 0 ? "direct" : "native"
        : undefined,
    loopTargetMinutes: request.roundTrip?.targetMinutes ?? request.loopTargetMinutes,
    avoidHighways: request.avoidHighways,
    avoidAreas: request.avoidAreas?.map((area) => ({ ...area, polygon: [...area.polygon] })),
    segmentProfiles: request.segmentProfiles ? [...request.segmentProfiles] : undefined
  }
  normalized.featureProvenance = featureProvenanceForPlannedRoute(normalized)
  return {
    ...normalized,
    routeScore: scorePlannedRoute(normalized, {
      profile: request.profile,
      bikeProfile: request.bikeProfile,
      corridor: sketchCorridorContext(request.sketchCorridor)
    })
  }
}
