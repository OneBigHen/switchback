import type { Coordinate } from "@/lib/routing/types"

/** The only stable identity accepted for Road Intelligence Graph segments. */
export type CanonicalSegmentDirection = "forward" | "reverse"

export interface CanonicalSegmentIdentity {
  osmWayId: string
  fromOsmNodeId: string
  toOsmNodeId: string
  direction: CanonicalSegmentDirection
}

export interface CanonicalSegmentInput extends CanonicalSegmentIdentity {
  osmSnapshot: string
  topologyVersion: string
  geometry: Coordinate[]
  /** When omitted, length is derived from the supplied geometry. */
  lengthMeters?: number
}

export interface CanonicalSegment extends CanonicalSegmentIdentity {
  segmentUid: string
  osmSnapshot: string
  topologyVersion: string
  geometryHash: string
  geometry: Coordinate[]
  lengthMeters: number
}

export interface CanonicalSegmentGraph {
  segments: CanonicalSegment[]
}

export type CanonicalSegmentMigrationKind =
  | "exact"
  | "same-way-overlap"
  | "spatial-overlap"
  | "one-to-many"
  | "many-to-one"

export interface CanonicalSegmentLineage {
  oldSegmentUid: string
  newSegmentUid: string
  overlapRatio: number
  directionMatch: boolean
  migrationConfidence: number
  sourceBuild: string
  targetBuild: string
  kind: CanonicalSegmentMigrationKind
}

export interface CanonicalSegmentMigrationQuarantine {
  oldSegmentUid: string
  candidateNewSegmentUids: string[]
  reason: string
}

export interface CanonicalSegmentMigrationPlan {
  lineage: CanonicalSegmentLineage[]
  quarantined: CanonicalSegmentMigrationQuarantine[]
}

export interface CanonicalSegmentMigrationOptions {
  sourceBuild: string
  targetBuild: string
  /** Maximum distance at which two directed geometries can overlap. */
  maxDistanceMeters?: number
  /** Minimum source geometry coverage for a non-exact candidate. */
  minimumOverlapRatio?: number
  /** Minimum combined coverage for a same-way split. */
  splitCoverageRatio?: number
  /** Equal-scoring candidates inside this band are ambiguous. */
  ambiguityDelta?: number
}

const SHA256_HEX = /^[0-9a-f]{64}$/
const OSM_ID = /^(0|[1-9][0-9]*)$/
const EARTH_RADIUS_METERS = 6_371_000
const DEFAULT_MAX_DISTANCE_METERS = 50
const DEFAULT_MINIMUM_OVERLAP_RATIO = 0.35
const DEFAULT_SPLIT_COVERAGE_RATIO = 0.85
const DEFAULT_AMBIGUITY_DELTA = 0.05

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isOsmId(value: unknown): value is string {
  return typeof value === "string" && OSM_ID.test(value)
}

function isDirection(value: unknown): value is CanonicalSegmentDirection {
  return value === "forward" || value === "reverse"
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90
}

function isGeometry(value: unknown): value is Coordinate[] {
  return Array.isArray(value) && value.length >= 2 && value.every(isCoordinate)
}

function isIdentity(value: unknown): value is CanonicalSegmentIdentity {
  return isRecord(value) &&
    isOsmId(value.osmWayId) &&
    isOsmId(value.fromOsmNodeId) &&
    isOsmId(value.toOsmNodeId) &&
    isDirection(value.direction)
}

function canonicalIdentity(identity: CanonicalSegmentIdentity): string {
  return [identity.osmWayId, identity.fromOsmNodeId, identity.toOsmNodeId, identity.direction].join("|")
}

function subtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error("Web Crypto SHA-256 is unavailable")
  return subtle
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await subtleCrypto().digest("SHA-256", bytes)
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("")
}

function normalizedGeometry(geometry: readonly Coordinate[]): Coordinate[] {
  return geometry.map(([longitude, latitude]) => [
    Object.is(longitude, -0) ? 0 : longitude,
    Object.is(latitude, -0) ? 0 : latitude
  ])
}

function geometryJson(geometry: readonly Coordinate[]): string {
  return JSON.stringify(normalizedGeometry(geometry))
}

function toRadians(value: number): number {
  return value * Math.PI / 180
}

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const deltaLatitude = toRadians(b[1] - a[1])
  const deltaLongitude = toRadians(b[0] - a[0])
  const latitudeA = toRadians(a[1])
  const latitudeB = toRadians(b[1])
  const value = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)))
}

function geometryLengthMeters(geometry: readonly Coordinate[]): number {
  let length = 0
  for (let index = 1; index < geometry.length; index += 1) {
    length += haversineMeters(geometry[index - 1]!, geometry[index]!)
  }
  return length
}

function pointToSegmentMeters(point: Coordinate, start: Coordinate, finish: Coordinate): number {
  const latitudeScale = 111_320
  const longitudeScale = Math.cos(toRadians(point[1])) * latitudeScale
  const ax = (start[0] - point[0]) * longitudeScale
  const ay = (start[1] - point[1]) * latitudeScale
  const bx = (finish[0] - point[0]) * longitudeScale
  const by = (finish[1] - point[1]) * latitudeScale
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const position = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared))
  return Math.hypot(ax + position * dx, ay + position * dy)
}

function pointToLineMeters(point: Coordinate, geometry: readonly Coordinate[]): number {
  let best = Number.POSITIVE_INFINITY
  for (let index = 1; index < geometry.length; index += 1) {
    best = Math.min(best, pointToSegmentMeters(point, geometry[index - 1]!, geometry[index]!))
  }
  return best
}

function sampleGeometry(geometry: readonly Coordinate[], samples = 64): Coordinate[] {
  const lengths = [0]
  for (let index = 1; index < geometry.length; index += 1) {
    lengths.push(lengths[index - 1]! + haversineMeters(geometry[index - 1]!, geometry[index]!))
  }
  const total = lengths.at(-1) ?? 0
  if (total === 0) return [geometry[0]!]
  const result: Coordinate[] = []
  for (let sample = 0; sample <= samples; sample += 1) {
    const target = total * sample / samples
    let index = 1
    while (index < lengths.length && lengths[index]! < target) index += 1
    const previousLength = lengths[index - 1]!
    const segmentLength = lengths[index]! - previousLength
    const ratio = segmentLength === 0 ? 0 : (target - previousLength) / segmentLength
    const start = geometry[index - 1]!
    const finish = geometry[index]!
    result.push([
      start[0] + (finish[0] - start[0]) * ratio,
      start[1] + (finish[1] - start[1]) * ratio
    ])
  }
  return result
}

function sourceCoverage(source: CanonicalSegment, target: CanonicalSegment, maxDistanceMeters: number): number {
  const samples = sampleGeometry(source.geometry)
  const covered = samples.filter((point) => pointToLineMeters(point, target.geometry) <= maxDistanceMeters).length
  return covered / samples.length
}

function directionMatch(oldSegment: CanonicalSegment, newSegment: CanonicalSegment, maxDistanceMeters: number): boolean {
  if (oldSegment.direction !== newSegment.direction) return false
  const oldStart = oldSegment.geometry[0]!
  const oldEnd = oldSegment.geometry.at(-1)!
  const newStart = newSegment.geometry[0]!
  const newEnd = newSegment.geometry.at(-1)!
  const sameOrder = haversineMeters(oldStart, newStart) + haversineMeters(oldEnd, newEnd)
  const reverseOrder = haversineMeters(oldStart, newEnd) + haversineMeters(oldEnd, newStart)
  return sameOrder <= reverseOrder && sameOrder <= maxDistanceMeters * 4 + Math.max(oldSegment.lengthMeters, newSegment.lengthMeters)
}

function assertInput(input: CanonicalSegmentInput): void {
  if (!isIdentity(input) || !isNonEmptyString(input.osmSnapshot) || !isNonEmptyString(input.topologyVersion)) {
    throw new Error("Canonical segment identity and build metadata are required")
  }
  if (!isGeometry(input.geometry)) throw new Error("Canonical segment geometry must contain at least two valid coordinates")
  const length = input.lengthMeters ?? geometryLengthMeters(input.geometry)
  if (!Number.isFinite(length) || length <= 0) throw new Error("Canonical segment length must be positive")
}

/** Compute the stable OSM-directed identity; GraphHopper edge IDs never enter this hash. */
export async function canonicalSegmentUid(identity: CanonicalSegmentIdentity): Promise<string> {
  if (!isIdentity(identity)) throw new Error("Canonical segment identity is invalid")
  return sha256Hex(canonicalIdentity(identity))
}

/** Hash normalized coordinates only; metadata changes do not alter geometry identity. */
export async function canonicalSegmentGeometryHash(geometry: readonly Coordinate[]): Promise<string> {
  if (!isGeometry(geometry)) throw new Error("Canonical segment geometry is invalid")
  return sha256Hex(geometryJson(geometry))
}

export async function createCanonicalSegment(input: CanonicalSegmentInput): Promise<CanonicalSegment> {
  assertInput(input)
  const geometry = normalizedGeometry(input.geometry)
  const [segmentUid, geometryHash] = await Promise.all([
    canonicalSegmentUid(input),
    canonicalSegmentGeometryHash(geometry)
  ])
  return {
    segmentUid,
    osmWayId: input.osmWayId,
    fromOsmNodeId: input.fromOsmNodeId,
    toOsmNodeId: input.toOsmNodeId,
    direction: input.direction,
    osmSnapshot: input.osmSnapshot.trim(),
    topologyVersion: input.topologyVersion.trim(),
    geometryHash,
    geometry,
    lengthMeters: input.lengthMeters ?? geometryLengthMeters(geometry)
  }
}

/** Structural validation for JSON/database boundaries. Hash contents are checked by verifyCanonicalSegment. */
export function validateCanonicalSegment(value: unknown): value is CanonicalSegment {
  return isRecord(value) &&
    isIdentity(value) &&
    typeof value.segmentUid === "string" && SHA256_HEX.test(value.segmentUid) &&
    isNonEmptyString(value.osmSnapshot) &&
    isNonEmptyString(value.topologyVersion) &&
    typeof value.geometryHash === "string" && SHA256_HEX.test(value.geometryHash) &&
    isGeometry(value.geometry) &&
    typeof value.lengthMeters === "number" && Number.isFinite(value.lengthMeters) && value.lengthMeters > 0
}

/** Verify both hashes before a segment is admitted to a graph; migration consumes admitted segments. */
export async function verifyCanonicalSegment(value: unknown): Promise<boolean> {
  if (!validateCanonicalSegment(value)) return false
  const [segmentUid, geometryHash] = await Promise.all([
    canonicalSegmentUid(value),
    canonicalSegmentGeometryHash(value.geometry)
  ])
  return segmentUid === value.segmentUid && geometryHash === value.geometryHash
}

export async function buildCanonicalSegmentGraph(segments: readonly CanonicalSegment[]): Promise<CanonicalSegmentGraph> {
  const seen = new Set<string>()
  for (const segment of segments) {
    if (!validateCanonicalSegment(segment)) throw new Error("Canonical segment graph contains an invalid segment")
    if (seen.has(segment.segmentUid)) throw new Error(`Duplicate canonical segment ${segment.segmentUid}`)
    seen.add(segment.segmentUid)
  }
  const verified = await Promise.all(segments.map(verifyCanonicalSegment))
  if (verified.some((isValid) => !isValid)) throw new Error("Canonical segment graph contains a hash-mismatched segment")
  return { segments: segments.map((segment) => ({ ...segment, geometry: normalizedGeometry(segment.geometry) })) }
}

interface MigrationCandidate {
  oldSegment: CanonicalSegment
  newSegment: CanonicalSegment
  overlapRatio: number
  directionMatch: boolean
  baseKind: "exact" | "same-way-overlap" | "spatial-overlap"
}

function candidateRank(kind: MigrationCandidate["baseKind"]): number {
  return kind === "exact" ? 3 : kind === "same-way-overlap" ? 2 : 1
}

function candidateConfidence(candidate: MigrationCandidate): number {
  if (candidate.baseKind === "exact") return 1
  return candidate.overlapRatio
}

function quarantine(
  quarantined: CanonicalSegmentMigrationQuarantine[],
  oldSegment: CanonicalSegment,
  candidates: readonly MigrationCandidate[],
  reason: string
): void {
  quarantined.push({
    oldSegmentUid: oldSegment.segmentUid,
    candidateNewSegmentUids: candidates.map((candidate) => candidate.newSegment.segmentUid),
    reason
  })
}

async function assertVerifiedSegments(segments: readonly CanonicalSegment[], label: string): Promise<void> {
  const verified = await Promise.all(segments.map(verifyCanonicalSegment))
  if (verified.some((isValid) => !isValid)) throw new Error(`${label} canonical segment set contains a hash-mismatched segment`)
}

/**
 * Match graph builds conservatively. Exact identity wins, then same-way
 * directed overlap, then spatial directed overlap. Anything that cannot be
 * distinguished safely is quarantined instead of silently moving evidence.
 */
export async function planCanonicalSegmentMigration(
  oldSegments: readonly CanonicalSegment[],
  newSegments: readonly CanonicalSegment[],
  options: CanonicalSegmentMigrationOptions
): Promise<CanonicalSegmentMigrationPlan> {
  if (!isNonEmptyString(options.sourceBuild) || !isNonEmptyString(options.targetBuild)) {
    throw new Error("Canonical segment migration requires source and target builds")
  }
  await assertVerifiedSegments(oldSegments, "Old")
  await assertVerifiedSegments(newSegments, "New")
  const maxDistanceMeters = options.maxDistanceMeters ?? DEFAULT_MAX_DISTANCE_METERS
  const minimumOverlapRatio = options.minimumOverlapRatio ?? DEFAULT_MINIMUM_OVERLAP_RATIO
  const splitCoverageRatio = options.splitCoverageRatio ?? DEFAULT_SPLIT_COVERAGE_RATIO
  const ambiguityDelta = options.ambiguityDelta ?? DEFAULT_AMBIGUITY_DELTA
  if (!Number.isFinite(maxDistanceMeters) || maxDistanceMeters <= 0 ||
    !Number.isFinite(minimumOverlapRatio) || minimumOverlapRatio < 0 || minimumOverlapRatio > 1 ||
    !Number.isFinite(splitCoverageRatio) || splitCoverageRatio < 0 || splitCoverageRatio > 1 ||
    !Number.isFinite(ambiguityDelta) || ambiguityDelta < 0 || ambiguityDelta > 1) {
    throw new Error("Canonical segment migration thresholds are invalid")
  }

  const candidatesByOld = new Map<string, MigrationCandidate[]>()
  for (const oldSegment of oldSegments) {
    const candidates: MigrationCandidate[] = []
    for (const newSegment of newSegments) {
      const exact = oldSegment.osmWayId === newSegment.osmWayId &&
        oldSegment.fromOsmNodeId === newSegment.fromOsmNodeId &&
        oldSegment.toOsmNodeId === newSegment.toOsmNodeId &&
        oldSegment.direction === newSegment.direction
      if (exact) {
        candidates.push({ oldSegment, newSegment, overlapRatio: 1, directionMatch: true, baseKind: "exact" })
        continue
      }
      const sameWay = oldSegment.osmWayId === newSegment.osmWayId
      const matchesDirection = directionMatch(oldSegment, newSegment, maxDistanceMeters)
      if (!matchesDirection) continue
      const overlapRatio = sourceCoverage(oldSegment, newSegment, maxDistanceMeters)
      if (overlapRatio < minimumOverlapRatio) continue
      candidates.push({
        oldSegment,
        newSegment,
        overlapRatio,
        directionMatch: true,
        baseKind: sameWay ? "same-way-overlap" : "spatial-overlap"
      })
    }
    candidates.sort((left, right) => candidateRank(right.baseKind) - candidateRank(left.baseKind) || right.overlapRatio - left.overlapRatio)
    candidatesByOld.set(oldSegment.segmentUid, candidates)
  }

  const selectedByOld = new Map<string, MigrationCandidate[]>()
  const quarantined: CanonicalSegmentMigrationQuarantine[] = []
  for (const oldSegment of oldSegments) {
    const candidates = candidatesByOld.get(oldSegment.segmentUid) ?? []
    if (candidates.length === 0) {
      quarantine(quarantined, oldSegment, [], "No exact, same-way, or directional spatial overlap met the migration threshold.")
      continue
    }
    if (candidates[0]!.baseKind === "exact") {
      const exact = candidates.filter((candidate) => candidate.baseKind === "exact")
      if (exact.length !== 1) {
        quarantine(quarantined, oldSegment, exact, "Multiple current segments claim the same OSM-directed identity.")
        continue
      }
      selectedByOld.set(oldSegment.segmentUid, exact)
      continue
    }

    const best = candidates[0]!
    const tied = candidates.filter((candidate) =>
      candidate.baseKind === best.baseKind && best.overlapRatio - candidate.overlapRatio <= ambiguityDelta
    )
    if (tied.length === 1) {
      selectedByOld.set(oldSegment.segmentUid, tied)
      continue
    }
    const sameWaySplit = best.baseKind === "same-way-overlap" &&
      tied.every((candidate) => candidate.oldSegment.osmWayId === candidate.newSegment.osmWayId) &&
      tied.reduce((total, candidate) => total + candidate.overlapRatio, 0) >= splitCoverageRatio
    if (sameWaySplit) {
      selectedByOld.set(oldSegment.segmentUid, tied)
    } else {
      quarantine(quarantined, oldSegment, tied, "Multiple plausible migration targets are indistinguishable; evidence is quarantined.")
    }
  }

  const selectedByNew = new Map<string, MigrationCandidate[]>()
  for (const candidates of selectedByOld.values()) {
    for (const candidate of candidates) {
      const list = selectedByNew.get(candidate.newSegment.segmentUid) ?? []
      list.push(candidate)
      selectedByNew.set(candidate.newSegment.segmentUid, list)
    }
  }

  for (const [newUid, candidates] of selectedByNew) {
    if (candidates.length < 2) continue
    const sameWayMerge = candidates.every((candidate) =>
      candidate.oldSegment.osmWayId === candidate.newSegment.osmWayId &&
      candidate.oldSegment.direction === candidate.newSegment.direction
    )
    if (sameWayMerge) continue
    for (const candidate of candidates) {
      selectedByOld.delete(candidate.oldSegment.segmentUid)
      quarantine(quarantined, candidate.oldSegment, [candidate], `Current segment ${newUid} has unrelated plausible predecessors; evidence is quarantined.`)
    }
  }

  const lineage: CanonicalSegmentLineage[] = []
  for (const [oldUid, candidates] of selectedByOld) {
    const merge = candidates.some((candidate) => (selectedByNew.get(candidate.newSegment.segmentUid)?.length ?? 0) > 1)
    const split = candidates.length > 1
    const kind: CanonicalSegmentMigrationKind = split
      ? "one-to-many"
      : merge
        ? "many-to-one"
        : candidates[0]!.baseKind
    for (const candidate of candidates) {
      const confidence = candidateConfidence(candidate)
      lineage.push({
        oldSegmentUid: oldUid,
        newSegmentUid: candidate.newSegment.segmentUid,
        overlapRatio: candidate.overlapRatio,
        directionMatch: candidate.directionMatch,
        migrationConfidence: confidence,
        sourceBuild: options.sourceBuild,
        targetBuild: options.targetBuild,
        kind
      })
    }
  }
  return { lineage, quarantined }
}
