import Dexie, { type EntityTable } from "dexie"
import type { Coordinate } from "@/lib/routing/types"
import {
  isActivelyClosed,
  isLegallyProhibitedForMotorcycle,
  type RoadAccessSnapshot
} from "@/lib/roads/road-access"

/**
 * Two lock strengths, no more.
 *
 * - `must` — route is invalid if the corridor cannot be matched or legally
 *   ridden. The planner must surface the failure and the previous route,
 *   never silently drop the lock.
 * - `prefer` — apply a substantial routing reward to edges inside the
 *   corridor but tolerate detours. The route explanation must say why a
 *   prefer lock was skipped (e.g. "47-mile backtrack").
 */
export type RoadLockMode = "must" | "prefer"

/**
 * Where the lock geometry came from. Provenance controls presentation
 * only, never legal priority; a manually selected road does not become
 * legally rideable just because the rider drew it.
 */
export type RoadLockProvenance = "manual" | "gpx" | "image-trace" | "rematched"

/**
 * How confidently the lock matches the current routing graph. The UI
 * renders these as green / amber / red.
 */
export type RoadLockMatchConfidence = "exact" | "matched" | "approximate"

/**
 * Status of a lock after rematching against the current graph. The
 * planner never silently drops a lock, so even `unresolved` carries a
 * user-visible explanation.
 */
export type RoadLockMatchStatus =
  | { kind: "exact"; edgeIds: string[] }
  | { kind: "approximate" }
  | { kind: "unresolved"; reason: string }

/** Accuracy statement shown when a lock or trace comes from an image. */
export const IMAGE_TRACE_ACCURACY_STATEMENT =
  "Approximate trace\nThis route was reconstructed from an image. Confirm all highlighted roads, access restrictions, and unmatched sections before riding."

/**
 * A contiguous road corridor selected between two points, never a road
 * name. Locks are stored provider-neutral so a future router can adopt
 * them by rematching the geometry and anchors against its own graph.
 */
export interface RoadLock {
  id: string
  mode: RoadLockMode
  displayName?: string
  /** Primary matching data: edge ids on the graph the lock was built against. */
  edgeIds: string[]
  /** Persisted LineString so the lock survives a graph change. */
  geometry: { type: "LineString"; coordinates: Coordinate[] }
  /** Ordered anchor points the rematch must preserve in sequence. */
  orderedAnchors: Coordinate[]
  /** Initial 50m fallback corridor; advanced setting can widen this. */
  fallbackToleranceMeters: number
  source: RoadLockProvenance
  confidence: RoadLockMatchConfidence
  sourceRegionId: string
  sourceGraphVersion: string
  accessSnapshot: RoadAccessSnapshot
  createdAt: string
  /** Set when a rematch updates the geometry on a newer graph version. */
  rematchedAt?: string
}

/** Per-lock outcome surfaced from route planning. */
export interface RoadLockSatisfaction {
  lockId: string
  mode: RoadLockMode
  satisfied: boolean
  match: RoadLockMatchStatus
  /** Why a prefer lock was skipped, in plain language. */
  skippedReason?: string
}

/**
 * Image-overlay workflow state, captured so the assisted trace UI can
 * resume after the rider tabs away. The uploaded image is kept local
 * and temporary; the alignment transforms, not the image itself, are
 * what the planner persists on the road lock.
 */
export interface RoadLockImageOverlayState {
  /** Two reference points the rider pinned from the image onto the map. */
  controlPoints: Array<{
    imageX: number
    imageY: number
    mapCoordinate: Coordinate
  }>
  /** Optional third control point used to verify alignment. */
  verifyPoint?: {
    imageX: number
    imageY: number
    mapCoordinate: Coordinate
  }
  translate: { x: number; y: number }
  scale: number
  rotationDegrees: number
  opacity: number
  /** Traced polylines in image pixel space; snapped to routable roads on save. */
  traces: Array<Array<{ imageX: number; imageY: number }>>
}

class RoadLockDatabase extends Dexie {
  locks!: EntityTable<RoadLock, "id">

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      locks: "&id, mode, source, sourceRegionId, sourceGraphVersion, createdAt"
    })
  }
}

export interface RoadLockListFilter {
  mode?: RoadLockMode
  source?: RoadLockProvenance
  sourceRegionId?: string
}

/**
 * Local IndexedDB-backed library of road locks. No account, no
 * community moderation, no trust scoring — this is a personal self-hosted
 * app and locks live with the rider's saved routes.
 */
export class RoadLockLibrary {
  private readonly database: RoadLockDatabase
  private lastTimestamp = 0

  constructor(readonly name = "switchback-road-locks") {
    this.database = new RoadLockDatabase(name)
  }

  private now(): string {
    const timestamp = Math.max(Date.now(), this.lastTimestamp + 1)
    this.lastTimestamp = timestamp
    return new Date(timestamp).toISOString()
  }

  async save(lock: RoadLock): Promise<RoadLock> {
    if (!lock.id) throw new Error("RoadLock requires an id")
    if (!lock.sourceRegionId) throw new Error("RoadLock requires a source region")
    if (!lock.sourceGraphVersion) throw new Error("RoadLock requires a source graph version")
    await this.database.locks.put(structuredClone(lock))
    return lock
  }

  async get(id: string): Promise<RoadLock | undefined> {
    return this.database.locks.get(id)
  }

  async list(filter: RoadLockListFilter = {}): Promise<RoadLock[]> {
    let collection = this.database.locks.orderBy("createdAt").reverse()
    if (filter.mode) collection = collection.filter((lock) => lock.mode === filter.mode)
    if (filter.source) collection = collection.filter((lock) => lock.source === filter.source)
    if (filter.sourceRegionId) {
      collection = collection.filter((lock) => lock.sourceRegionId === filter.sourceRegionId)
    }
    return collection.toArray()
  }

  async remove(id: string): Promise<void> {
    await this.database.locks.delete(id)
  }

  async destroy(): Promise<void> {
    this.database.close()
    await Dexie.delete(this.name)
  }
}

export function generateRoadLockId(): string {
  return `lock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Build a road lock from a manual corridor the rider selected between
 * two ordered anchor points. The caller is responsible for snapping the
 * anchors to graph edges and supplying the resulting edge ids.
 */
export function createManualRoadLock(input: {
  mode: RoadLockMode
  displayName?: string
  edgeIds: string[]
  geometry: Coordinate[]
  orderedAnchors: Coordinate[]
  fallbackToleranceMeters?: number
  accessSnapshot: RoadAccessSnapshot
  sourceRegionId: string
  sourceGraphVersion: string
}): RoadLock {
  if (input.orderedAnchors.length < 2) {
    throw new Error("A road lock requires at least two ordered anchors")
  }
  if (input.geometry.length < 2) {
    throw new Error("A road lock requires a LineString with at least two coordinates")
  }
  return {
    id: generateRoadLockId(),
    mode: input.mode,
    displayName: input.displayName?.trim() || undefined,
    edgeIds: [...input.edgeIds],
    geometry: { type: "LineString", coordinates: input.geometry.map((c) => [c[0], c[1]] as Coordinate) },
    orderedAnchors: input.orderedAnchors.map((c) => [c[0], c[1]] as Coordinate),
    fallbackToleranceMeters: Math.max(10, input.fallbackToleranceMeters ?? 50),
    source: "manual",
    // A manual tap never yields graph edge ids today, so it can never claim
    // an exact match. "exact" would mislabel a straight-line placeholder as
    // a verified graph corridor (Phase 0 containment, SB-007).
    confidence: input.edgeIds.length > 0 ? "exact" : "approximate",
    sourceRegionId: input.sourceRegionId,
    sourceGraphVersion: input.sourceGraphVersion,
    accessSnapshot: input.accessSnapshot,
    createdAt: new Date().toISOString()
  }
}

/**
 * Build a road lock from a georeferenced GPX track. GPX is the trusted
 * import path because it already carries coordinates the rematch can
 * trust without a screenshot georeferencing step.
 */
export function createGpxRoadLock(input: {
  mode: RoadLockMode
  displayName?: string
  edgeIds: string[]
  geometry: Coordinate[]
  orderedAnchors: Coordinate[]
  accessSnapshot: RoadAccessSnapshot
  sourceRegionId: string
  sourceGraphVersion: string
}): RoadLock {
  return {
    ...createManualRoadLock(input),
    source: "gpx",
    // GPX carries real coordinates but no graph match until the Phase 2
    // matching endpoint runs; never claim "matched" against the live graph
    // without edge ids (SB-007 containment).
    confidence: input.edgeIds.length > 0 ? "matched" : "approximate"
  }
}

/**
 * Build an approximate road lock from an image-overlay trace. The
 * accuracy statement is surfaced wherever this lock is rendered; the
 * underlying image itself is never persisted or redistributed.
 */
export function createImageTraceRoadLock(input: {
  mode: RoadLockMode
  displayName?: string
  edgeIds: string[]
  geometry: Coordinate[]
  orderedAnchors: Coordinate[]
  accessSnapshot: RoadAccessSnapshot
  sourceRegionId: string
  sourceGraphVersion: string
}): RoadLock {
  return {
    ...createManualRoadLock(input),
    source: "image-trace",
    confidence: "approximate"
  }
}

const EARTH_RADIUS_METERS = 6_371_000

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const [lonA, latA] = a
  const [lonB, latB] = b
  const toRadians = (deg: number) => (deg * Math.PI) / 180
  const phiA = toRadians(latA)
  const phiB = toRadians(latB)
  const deltaPhi = toRadians(latB - latA)
  const deltaLambda = toRadians(lonB - lonA)
  const sinHalfPhi = Math.sin(deltaPhi / 2)
  const sinHalfLambda = Math.sin(deltaLambda / 2)
  const h =
    sinHalfPhi * sinHalfPhi +
    Math.cos(phiA) * Math.cos(phiB) * sinHalfLambda * sinHalfLambda
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

function pointToSegmentMeters(point: Coordinate, a: Coordinate, b: Coordinate): number {
  const [px, py] = point
  const [ax, ay] = a
  const [bx, by] = b
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return haversineMeters(point, a)
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return haversineMeters(point, [ax + t * dx, ay + t * dy])
}

/**
 * Distance in meters from `point` to the nearest segment of `line`. Used
 * by the rematch path: when exact edge ids no longer exist, we still
 * accept the rematch when the new geometry lies within the lock's
 * fallback tolerance of every stored anchor (in their stored order).
 */
export function distanceToLineMeters(point: Coordinate, line: readonly Coordinate[]): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY
  if (line.length === 1) return haversineMeters(point, line[0]!)
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < line.length - 1; i += 1) {
    const d = pointToSegmentMeters(point, line[i]!, line[i + 1]!)
    if (d < best) best = d
  }
  return best
}

/**
 * Confirm that the ordered anchors of a candidate rematch walk the
 * stored geometry in the same order the rider originally selected. The
 * rematch is rejected when anchors occur out of sequence — otherwise a
 * road lock could silently slide onto an adjacent parallel road.
 */
export function anchorsInOrder(orderedAnchors: readonly Coordinate[], line: readonly Coordinate[]): boolean {
  if (orderedAnchors.length < 2) return true
  let lastIndex = -1
  for (const anchor of orderedAnchors) {
    let bestIndex = -1
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = lastIndex + 1; i < line.length; i += 1) {
      const d = haversineMeters(anchor, line[i]!)
      if (d < bestDistance) {
        bestDistance = d
        bestIndex = i
      }
    }
    if (bestIndex < 0) return false
    if (bestIndex <= lastIndex) return false
    lastIndex = bestIndex
  }
  return true
}

export interface RoadLockRematchResult {
  lockId: string
  match: RoadLockMatchStatus
  /** Updated lock with new edge ids, geometry, and rematchedAt. Null when no match was found. */
  updated: RoadLock | null
}

/**
 * Rematch a stored lock against the current graph. Returns the new
 * match status and, when successful, an updated lock whose `edgeIds`
 * point to the current graph and whose `source` flips to `rematched`.
 *
 * Pure: the caller persists `updated` via the library if it wants the
 * rematch to survive, and decides whether to surface a UI prompt.
 */
export function rematchRoadLock(
  lock: RoadLock,
  currentGraph: {
    edgeIds: string[]
    geometry: Coordinate[]
  },
  toleranceMetersOverride?: number
): RoadLockRematchResult {
  const tolerance = toleranceMetersOverride ?? lock.fallbackToleranceMeters
  if (currentGraph.edgeIds.length === 0 || currentGraph.geometry.length < 2) {
    return {
      lockId: lock.id,
      match: { kind: "unresolved", reason: "The current graph contains no routable edges in this corridor." },
      updated: null
    }
  }
  const allAnchorsMatch = lock.orderedAnchors.every((anchor) => {
    return distanceToLineMeters(anchor, currentGraph.geometry) <= tolerance
  })
  if (!allAnchorsMatch) {
    return {
      lockId: lock.id,
      match: { kind: "unresolved", reason: "Anchors fall outside the fallback corridor on the newer graph." },
      updated: null
    }
  }
  if (!anchorsInOrder(lock.orderedAnchors, currentGraph.geometry)) {
    return {
      lockId: lock.id,
      match: {
        kind: "unresolved",
        reason: "Anchors occur out of order on the newer graph; refusing to slide the lock."
      },
      updated: null
    }
  }
  const exactEdgeMatch = currentGraph.edgeIds.length > 0 && currentGraph.edgeIds.every((id) => lock.edgeIds.includes(id))
  const match: RoadLockMatchStatus = exactEdgeMatch
    ? { kind: "exact", edgeIds: [...currentGraph.edgeIds] }
    : { kind: "approximate" }
  const updated: RoadLock = {
    ...lock,
    edgeIds: [...currentGraph.edgeIds],
    geometry: { type: "LineString", coordinates: currentGraph.geometry.map((c) => [c[0], c[1]] as Coordinate) },
    source: lock.source === "rematched" ? "rematched" : "rematched",
    confidence: match.kind === "exact" ? "exact" : "matched",
    rematchedAt: new Date().toISOString()
  }
  return { lockId: lock.id, match, updated }
}

/**
 * Compute lock satisfaction against a planned route geometry and the
 * snapshots that were captured when the lock was built. The route
 * planner never silently drops a lock: a `must` lock that cannot be
 * satisfied must keep the previous route visible and offer Try a wider
 * match / Convert to Prefer / Remove lock / Restore previous route.
 *
 * Legal precedence: a road lock must not override motorcycle=no,
 * access=private, an active closure, or a known incompatible surface.
 * Such a violation makes the route invalid for a `must` lock, even
 * though the geometry happens to pass through the corridor.
 */
export function evaluateRoadLockSatisfaction(
  lock: RoadLock,
  routeGeometry: Coordinate[]
): RoadLockSatisfaction {
  if (routeGeometry.length === 0) {
    return {
      lockId: lock.id,
      mode: lock.mode,
      satisfied: false,
      match: { kind: "unresolved", reason: "Planned route has no geometry." },
      skippedReason: lock.mode === "prefer" ? "Preferred road skipped because no route was produced." : undefined
    }
  }

  const legalBlock = isLegallyProhibitedForMotorcycle(lock.accessSnapshot)
  const closureBlock = isActivelyClosed(lock.accessSnapshot)
  if (legalBlock || closureBlock) {
    const reason = legalBlock
      ? "Lock conflicts with a legal motorcycle access restriction."
      : "Lock conflicts with an active conditional or seasonal closure."
    return {
      lockId: lock.id,
      mode: lock.mode,
      satisfied: false,
      match: { kind: "unresolved", reason },
      skippedReason: lock.mode === "prefer" ? reason : undefined
    }
  }

  const tolerance = lock.fallbackToleranceMeters
  const matched = lock.orderedAnchors.every((anchor) => distanceToLineMeters(anchor, routeGeometry) <= tolerance)
  if (matched) {
    return {
      lockId: lock.id,
      mode: lock.mode,
      satisfied: true,
      match: lock.confidence === "exact" ? { kind: "exact", edgeIds: lock.edgeIds } : { kind: "approximate" }
    }
  }

  const reason = "Preferred road skipped because it requires a detour the rider would notice."
  return {
    lockId: lock.id,
    mode: lock.mode,
    satisfied: false,
    match: { kind: "unresolved", reason },
    skippedReason: lock.mode === "prefer" ? reason : undefined
  }
}

/** Convert a `must` lock to a `prefer` lock while preserving provenance. */
export function convertMustLockToPrefer(lock: RoadLock): RoadLock {
  if (lock.mode !== "must") return lock
  return { ...lock, mode: "prefer" }
}

/**
 * Options offered to the rider when a must-use lock cannot be matched,
 * per the lead decision: keep the previous route visible and offer
 * these four explicit choices rather than silently returning the best
 * route that ignores the lock.
 */
export const MUST_LOCK_UNRESOLVED_OPTIONS = [
  "try-wider-match",
  "convert-to-prefer",
  "remove-lock",
  "restore-previous-route"
] as const
export type MustLockUnresolvedOption = (typeof MUST_LOCK_UNRESOLVED_OPTIONS)[number]

export function describePreferSkipReason(reason: string, detourMiles?: number): string {
  if (detourMiles !== undefined && detourMiles > 0) {
    return `Preferred road skipped because it requires a ${Math.round(detourMiles)}-mile backtrack.`
  }
  return reason
}
