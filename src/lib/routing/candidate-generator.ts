import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { AnchorSet } from "./destination-corridors"
import type { RouteCandidateSource, Waypoint } from "./types"

export interface GeneratedRouteCandidate {
  id: string
  source: RouteCandidateSource
  request: NormalizedRouteRequest
  /** Bounded source evidence used by later ranking/diversity phases. */
  reward: number
}

export interface CorridorCandidateOptions {
  maxCandidates?: number
  maxAnchorsPerCandidate?: number
}

export interface LoopCandidateOptions {
  maxCandidates?: number
  headingSectors?: readonly number[]
  seedStep?: number
}

const DEFAULT_MAX_CANDIDATES = 4
const DEFAULT_MAX_LOOP_CANDIDATES = 7
const DEFAULT_MAX_ANCHORS = 3
const DEFAULT_HEADING_SECTORS = [0, 90, 180, 270] as const

function boundedInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}

function validCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90
}

function cloneWaypoint(point: Waypoint): Waypoint {
  return { ...point }
}

function sourceForAnchorSet(source: AnchorSet["source"]): RouteCandidateSource {
  if (source === "rig") return "rig"
  if (source === "gpx" || source === "hint") return "community"
  return "road-character"
}

function candidateKey(points: readonly Waypoint[]): string {
  return points.map((point) => `${point.lon.toFixed(6)},${point.lat.toFixed(6)}`).join(";")
}

function normalizeHeading(value: number): number {
  return ((value % 360) + 360) % 360
}

/** Build bounded, topology-neutral A-to-B corridor requests from verified anchors. */
export function generateCorridorCandidates(
  request: NormalizedRouteRequest,
  anchorSets: readonly AnchorSet[],
  inputOptions: CorridorCandidateOptions = {}
): GeneratedRouteCandidate[] {
  if (request.points.length < 2) throw new Error("Corridor candidates require a start and finish")
  const maxCandidates = boundedInteger(inputOptions.maxCandidates ?? DEFAULT_MAX_CANDIDATES, "Maximum corridor candidates")
  const maxAnchors = boundedInteger(inputOptions.maxAnchorsPerCandidate ?? DEFAULT_MAX_ANCHORS, "Maximum candidate anchors")
  const start = request.points[0]!
  const finish = request.points[request.points.length - 1]!
  const seen = new Set<string>()
  const candidates: GeneratedRouteCandidate[] = []

  for (const set of anchorSets) {
    if (candidates.length >= maxCandidates || set.anchors.length === 0 || set.anchors.length > maxAnchors) continue
    if (set.anchors.some((anchor) => !validCoordinate(anchor))) continue
    const points = [
      cloneWaypoint(start),
      ...set.anchors.map(([lon, lat]) => ({ lat, lon, label: set.label })),
      cloneWaypoint(finish)
    ]
    const key = candidateKey(points)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      id: `corridor-${set.id}`,
      source: sourceForAnchorSet(set.source),
      request: { ...request, points },
      reward: Number(Math.max(0, set.evidenceMiles).toFixed(3))
    })
  }
  return candidates
}

/** Build deterministic loop seed/heading requests without random waypoint soup. */
export function generateLoopCandidates(
  request: NormalizedRouteRequest,
  inputOptions: LoopCandidateOptions = {}
): GeneratedRouteCandidate[] {
  if (!request.roundTrip || request.points.length !== 1) {
    throw new Error("Loop candidates require one start point and a round-trip request")
  }
  const maxCandidates = boundedInteger(inputOptions.maxCandidates ?? DEFAULT_MAX_LOOP_CANDIDATES, "Maximum loop candidates")
  const seedStep = boundedInteger(inputOptions.seedStep ?? 101, "Loop seed step")
  const sectors = (inputOptions.headingSectors ?? DEFAULT_HEADING_SECTORS)
    .filter((heading) => Number.isFinite(heading))
    .map(normalizeHeading)
  const headings = sectors.length > 0 ? [...new Set(sectors)] : [0]
  const baseSeed = request.roundTrip.seed ?? 0
  const baseHeading = request.roundTrip.heading === undefined
    ? undefined
    : normalizeHeading(request.roundTrip.heading)
  const candidates: GeneratedRouteCandidate[] = []
  const seen = new Set<string>()

  for (let index = 0; index < maxCandidates; index += 1) {
    const heading = index === 0 ? baseHeading : headings[(index - 1) % headings.length]
    const seed = baseSeed + index * seedStep
    const key = `${seed}:${heading ?? "none"}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      id: `loop-${seed}-${heading ?? "free"}`,
      source: index === 0 ? "loop-seed" : "heading-sector",
      request: {
        ...request,
        roundTrip: {
          ...request.roundTrip,
          seed,
          ...(heading === undefined ? {} : { heading })
        }
      },
      reward: 0
    })
  }
  return candidates
}
