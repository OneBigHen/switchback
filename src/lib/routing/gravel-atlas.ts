import { haversine } from "./scoring"
import type { Coordinate } from "./types"

export type GravelAtlasVerification = "routable" | "unverified" | "unroutable"

/**
 * A graph-checked, provenance-bearing gravel corridor derived from atlas data.
 *
 * `verification` is deliberately separate from `confidence`: the former is a
 * routing gate owned by the live motorcycle graph, while the latter expresses
 * how strongly the atlas/source evidence supports the gravel classification.
 */
export interface GravelAtlasCorridor {
  id: string
  label: string
  geometry: Coordinate[]
  verifiedGravelMeters: number
  longestContinuousGravelMeters: number
  fragmentCount: number
  confidence: number
  verification: GravelAtlasVerification
  sourceIds: string[]
}

export interface GravelAtlasSelectionEnvelope {
  maxPathDistanceMiles: number
  maxLateralMiles: number
}

export interface SelectedGravelAtlasCorridor {
  corridor: GravelAtlasCorridor
  /** Deterministic relative utility used only to bound candidate generation. */
  score: number
  /** Real source coordinates only; never synthetic/swing geometry. */
  anchors: Coordinate[]
}

export interface SelectGravelAtlasCorridorsInput {
  start: Coordinate
  finish: Coordinate
  envelope: GravelAtlasSelectionEnvelope
  corridors: readonly GravelAtlasCorridor[]
  maxCorridors?: number
}

const METERS_PER_MILE = 1609.344
const HARD_MAX_CORRIDORS = 3
const MAX_ANCHORS_PER_CORRIDOR = 3

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90
}

function distanceMiles(first: Coordinate, second: Coordinate): number {
  return haversine(first, second) / METERS_PER_MILE
}

/** Local equirectangular distance is sufficient for the bounded PA envelopes. */
function lateralDistanceMiles(
  point: Coordinate,
  start: Coordinate,
  finish: Coordinate
): number {
  const lineLength = haversine(start, finish)
  if (lineLength < 1) return distanceMiles(point, start)

  const radians = Math.PI / 180
  const cosLat = Math.cos((start[1] + finish[1]) / 2 * radians) || 1
  const ax = start[0] * cosLat
  const ay = start[1]
  const bx = finish[0] * cosLat
  const by = finish[1]
  const px = point[0] * cosLat
  const py = point[1]
  const deltaX = bx - ax
  const deltaY = by - ay
  const squaredLength = deltaX * deltaX + deltaY * deltaY
  const ratio = squaredLength === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * deltaX + (py - ay) * deltaY) / squaredLength))
  const closest: Coordinate = [
    (ax + ratio * deltaX) / cosLat,
    ay + ratio * deltaY
  ]
  return distanceMiles(point, closest)
}

function insideEnvelope(
  point: Coordinate,
  start: Coordinate,
  finish: Coordinate,
  envelope: GravelAtlasSelectionEnvelope
): boolean {
  const pathMiles = distanceMiles(start, point) + distanceMiles(point, finish)
  return pathMiles <= envelope.maxPathDistanceMiles &&
    lateralDistanceMiles(point, start, finish) <= envelope.maxLateralMiles
}

function validEnvelope(envelope: GravelAtlasSelectionEnvelope): boolean {
  return Number.isFinite(envelope.maxPathDistanceMiles) && envelope.maxPathDistanceMiles > 0 &&
    Number.isFinite(envelope.maxLateralMiles) && envelope.maxLateralMiles >= 0
}

function validCorridor(corridor: GravelAtlasCorridor): boolean {
  return corridor.id.trim().length > 0 &&
    corridor.label.trim().length > 0 &&
    corridor.geometry.length >= 2 &&
    corridor.geometry.every(isCoordinate) &&
    Number.isFinite(corridor.verifiedGravelMeters) && corridor.verifiedGravelMeters >= 0 &&
    Number.isFinite(corridor.longestContinuousGravelMeters) &&
    corridor.longestContinuousGravelMeters >= 0 &&
    corridor.longestContinuousGravelMeters <= corridor.verifiedGravelMeters &&
    Number.isInteger(corridor.fragmentCount) && corridor.fragmentCount >= 1 &&
    Number.isFinite(corridor.confidence) && corridor.confidence >= 0 && corridor.confidence <= 1 &&
    Array.isArray(corridor.sourceIds) && corridor.sourceIds.every((id) => id.trim().length > 0)
}

function spreadAnchors(points: readonly Coordinate[]): Coordinate[] {
  if (points.length <= MAX_ANCHORS_PER_CORRIDOR) return points.map((point) => [...point] as Coordinate)
  const indexes = [
    0,
    Math.floor((points.length - 1) / 2),
    points.length - 1
  ]
  return [...new Set(indexes)].map((index) => [...points[index]!] as Coordinate)
}

function cloneCorridor(corridor: GravelAtlasCorridor): GravelAtlasCorridor {
  return {
    ...corridor,
    geometry: corridor.geometry.map((point) => [...point] as Coordinate),
    sourceIds: [...corridor.sourceIds]
  }
}

function candidateScore(
  corridor: GravelAtlasCorridor,
  anchors: readonly Coordinate[],
  start: Coordinate,
  finish: Coordinate
): number {
  const verifiedMiles = corridor.verifiedGravelMeters / METERS_PER_MILE
  const continuousMiles = corridor.longestContinuousGravelMeters / METERS_PER_MILE
  const continuityShare = corridor.verifiedGravelMeters === 0
    ? 0
    : corridor.longestContinuousGravelMeters / corridor.verifiedGravelMeters
  const directMiles = distanceMiles(start, finish)
  const minimumAnchorPath = Math.min(
    ...anchors.map((anchor) => distanceMiles(start, anchor) + distanceMiles(anchor, finish))
  )
  const detourMiles = Math.max(0, minimumAnchorPath - directMiles)
  const fragmentationPenalty = Math.max(0, corridor.fragmentCount - 1) * 2.5

  return Number((
    continuousMiles * 4 +
    verifiedMiles * 1.5 +
    continuityShare * 8 +
    corridor.confidence * 6 -
    fragmentationPenalty -
    detourMiles * 0.5
  ).toFixed(6))
}

/**
 * Select a tiny, deterministic set of graph-verified gravel corridors that can
 * seed normal routing. This function cannot create hard/must-use requirements:
 * it only returns source anchors for bounded candidate generation.
 */
export function selectGravelAtlasCorridors(
  input: SelectGravelAtlasCorridorsInput
): SelectedGravelAtlasCorridor[] {
  if (!isCoordinate(input.start) || !isCoordinate(input.finish) || !validEnvelope(input.envelope)) {
    return []
  }

  const requestedMaximum = input.maxCorridors ?? HARD_MAX_CORRIDORS
  if (!Number.isInteger(requestedMaximum) || requestedMaximum <= 0) return []
  const limit = Math.min(HARD_MAX_CORRIDORS, requestedMaximum)

  return input.corridors.flatMap((corridor): SelectedGravelAtlasCorridor[] => {
    if (!validCorridor(corridor) || corridor.verification !== "routable") return []
    const eligibleGeometry = corridor.geometry.filter((point) =>
      insideEnvelope(point, input.start, input.finish, input.envelope)
    )
    if (eligibleGeometry.length === 0) return []
    const anchors = spreadAnchors(eligibleGeometry)
    return [{
      corridor: cloneCorridor(corridor),
      score: candidateScore(corridor, anchors, input.start, input.finish),
      anchors
    }]
  })
    .sort((left, right) => right.score - left.score || left.corridor.id.localeCompare(right.corridor.id))
    .slice(0, limit)
}
