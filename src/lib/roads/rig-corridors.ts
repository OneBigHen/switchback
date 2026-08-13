import {
  validateCanonicalSegment,
  type CanonicalSegment
} from "@/lib/roads/canonical-segments"
import {
  isRigSegmentAggregate,
  RIG_DIMENSION_KEYS,
  type RigDimensionKey,
  type RigRouteRole,
  type RigSegmentAggregate
} from "@/lib/roads/rig-evidence"

export interface RigCorridorSegmentInput {
  /** Must come from a verified canonical segment graph build. */
  segment: CanonicalSegment
  aggregate: RigSegmentAggregate
}

export interface RigCorridorBuildOptions {
  sourceBuild: string
  builtAt?: string
  minimumSegmentUtility?: number
  minimumEvidenceStrength?: number
  minimumContiguousMeters?: number
  connectionRadiusMeters?: number
  maximumCharacterDistance?: number
  maxSegments?: number
  maxSegmentsPerCorridor?: number
  maxCorridors?: number
}

export interface RigCorridorProvenance {
  sourceBuild: string
  builtAt: string
  segmentCount: number
  observationCount: number
  independentSourceCount: number
}

export interface RigCorridor {
  corridorId: string
  segmentUids: string[]
  entryNodeId: string
  exitNodeId: string
  lengthMeters: number
  expectedUtility: number
  confidence: number
  dominantRole: RigRouteRole
  dimensions: Partial<Record<RigDimensionKey, number>>
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number }
  provenance: RigCorridorProvenance
}

export interface RigSpatialIndexOptions {
  sourceBuild: string
  builtAt?: string
  zoom?: number
  maxSegments?: number
  maxTiles?: number
}

export interface RigSpatialTile {
  tileId: string
  segmentUids: string[]
}

export interface RigSpatialIndex {
  schemaVersion: 1
  sourceBuild: string
  builtAt: string
  zoom: number
  tiles: RigSpatialTile[]
}

const DEFAULT_CORRIDOR_MINIMUM_SEGMENT_UTILITY = 0.55
const DEFAULT_CORRIDOR_MINIMUM_EVIDENCE_STRENGTH = 0.15
const DEFAULT_MINIMUM_CONTIGUOUS_METERS = 5_000
const DEFAULT_CONNECTION_RADIUS_METERS = 50
const DEFAULT_MAXIMUM_CHARACTER_DISTANCE = 0.35
const DEFAULT_MAX_SEGMENTS = 50_000
const DEFAULT_MAX_SEGMENTS_PER_CORRIDOR = 4_096
const DEFAULT_MAX_CORRIDORS = 4_096
const DEFAULT_MAX_TILES = 100_000
const DEFAULT_SPATIAL_ZOOM = 12
const METERS_PER_DEGREE = 111_320

interface PreparedSegment extends RigCorridorSegmentInput {
  utility: number
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
}

function positiveOption(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be greater than zero`)
}

function nonNegativeOption(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must not be negative`)
}

function boundedOption(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`)
}

function builtAt(value: string | undefined): string {
  const resolved = value ?? new Date().toISOString()
  if (!isIsoDate(resolved)) throw new Error("RIG build timestamp must be an ISO date")
  return resolved
}

function metersBetween(a: readonly [number, number], b: readonly [number, number]): number {
  const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180
  const dx = (b[0] - a[0]) * METERS_PER_DEGREE * Math.cos(latitude)
  const dy = (b[1] - a[1]) * METERS_PER_DEGREE
  return Math.hypot(dx, dy)
}

function cellKey(point: readonly [number, number], cellMeters: number): string {
  return `${Math.floor(point[0] * METERS_PER_DEGREE / cellMeters)}:${Math.floor(point[1] * METERS_PER_DEGREE / cellMeters)}`
}

function neighboringCells(point: readonly [number, number], cellMeters: number): string[] {
  const longitude = Math.floor(point[0] * METERS_PER_DEGREE / cellMeters)
  const latitude = Math.floor(point[1] * METERS_PER_DEGREE / cellMeters)
  const cells: string[] = []
  for (let x = longitude - 1; x <= longitude + 1; x += 1) {
    for (let y = latitude - 1; y <= latitude + 1; y += 1) cells.push(`${x}:${y}`)
  }
  return cells
}

function characterDistance(left: RigSegmentAggregate, right: RigSegmentAggregate): number {
  let total = 0
  let count = 0
  for (const key of RIG_DIMENSION_KEYS) {
    const leftValue = left.dimensions[key]
    const rightValue = right.dimensions[key]
    if (leftValue === undefined || rightValue === undefined) continue
    total += Math.abs(leftValue - rightValue)
    count += 1
  }
  return count === 0 ? 0 : total / count
}

/** Equal-weight utility is deliberately a proxy until profile/corpus calibration exists. */
function utilityFor(aggregate: RigSegmentAggregate): number | null {
  const values = Object.values(aggregate.dimensions).filter(isUnitInterval)
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function validateCorridorInput(value: unknown): value is RigCorridorSegmentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const candidate = value as { segment?: unknown; aggregate?: unknown }
  return validateCanonicalSegment(candidate.segment) &&
    isRigSegmentAggregate(candidate.aggregate) &&
    candidate.segment.segmentUid === candidate.aggregate.segmentUid
}

function validateCorridorOptions(input: RigCorridorBuildOptions): Required<RigCorridorBuildOptions> {
  if (!isNonEmptyString(input.sourceBuild)) throw new Error("RIG corridor source build is required")
  const options = {
    sourceBuild: input.sourceBuild.trim(),
    builtAt: builtAt(input.builtAt),
    minimumSegmentUtility: input.minimumSegmentUtility ?? DEFAULT_CORRIDOR_MINIMUM_SEGMENT_UTILITY,
    minimumEvidenceStrength: input.minimumEvidenceStrength ?? DEFAULT_CORRIDOR_MINIMUM_EVIDENCE_STRENGTH,
    minimumContiguousMeters: input.minimumContiguousMeters ?? DEFAULT_MINIMUM_CONTIGUOUS_METERS,
    connectionRadiusMeters: input.connectionRadiusMeters ?? DEFAULT_CONNECTION_RADIUS_METERS,
    maximumCharacterDistance: input.maximumCharacterDistance ?? DEFAULT_MAXIMUM_CHARACTER_DISTANCE,
    maxSegments: input.maxSegments ?? DEFAULT_MAX_SEGMENTS,
    maxSegmentsPerCorridor: input.maxSegmentsPerCorridor ?? DEFAULT_MAX_SEGMENTS_PER_CORRIDOR,
    maxCorridors: input.maxCorridors ?? DEFAULT_MAX_CORRIDORS
  }
  boundedOption(options.minimumSegmentUtility, "RIG segment utility threshold")
  boundedOption(options.minimumEvidenceStrength, "RIG evidence threshold")
  nonNegativeOption(options.minimumContiguousMeters, "RIG minimum contiguous length")
  positiveOption(options.connectionRadiusMeters, "RIG connection radius")
  boundedOption(options.maximumCharacterDistance, "RIG character distance")
  if (!Number.isSafeInteger(options.maxSegments) || options.maxSegments <= 0) throw new Error("RIG maximum segments must be positive")
  if (!Number.isSafeInteger(options.maxSegmentsPerCorridor) || options.maxSegmentsPerCorridor <= 0) throw new Error("RIG maximum corridor segments must be positive")
  if (!Number.isSafeInteger(options.maxCorridors) || options.maxCorridors <= 0) throw new Error("RIG maximum corridors must be positive")
  return options
}

function validateSpatialOptions(input: RigSpatialIndexOptions): Required<RigSpatialIndexOptions> {
  if (!isNonEmptyString(input.sourceBuild)) throw new Error("RIG spatial index source build is required")
  const options = {
    sourceBuild: input.sourceBuild.trim(),
    builtAt: builtAt(input.builtAt),
    zoom: input.zoom ?? DEFAULT_SPATIAL_ZOOM,
    maxSegments: input.maxSegments ?? DEFAULT_MAX_SEGMENTS,
    maxTiles: input.maxTiles ?? DEFAULT_MAX_TILES
  }
  if (!Number.isSafeInteger(options.zoom) || options.zoom < 0 || options.zoom > 22) throw new Error("RIG spatial zoom must be an integer from 0 through 22")
  if (!Number.isSafeInteger(options.maxSegments) || options.maxSegments <= 0) throw new Error("RIG spatial maximum segments must be positive")
  if (!Number.isSafeInteger(options.maxTiles) || options.maxTiles <= 0) throw new Error("RIG spatial maximum tiles must be positive")
  return options
}

function addTile(
  tiles: Map<string, Set<string>>,
  tileId: string,
  segmentUid: string,
  maxTiles: number
): void {
  let segmentUids = tiles.get(tileId)
  if (!segmentUids) {
    if (tiles.size >= maxTiles) throw new Error("RIG spatial index exceeds the maximum tile count")
    segmentUids = new Set<string>()
    tiles.set(tileId, segmentUids)
  }
  segmentUids.add(segmentUid)
}

function webMercatorTile(point: readonly [number, number], zoom: number): string {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, point[1]))
  const scale = 2 ** zoom
  const x = Math.max(0, Math.min(scale - 1, Math.floor((point[0] + 180) / 360 * scale)))
  const radians = latitude * Math.PI / 180
  const y = Math.max(0, Math.min(scale - 1, Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * scale)))
  return `${zoom}/${x}/${y}`
}

function componentBounds(segments: readonly PreparedSegment[]): RigCorridor["bounds"] {
  const points = segments.flatMap(({ segment }) => segment.geometry)
  return points.reduce<RigCorridor["bounds"]>((bounds, [longitude, latitude]) => ({
    minLon: Math.min(bounds.minLon, longitude),
    minLat: Math.min(bounds.minLat, latitude),
    maxLon: Math.max(bounds.maxLon, longitude),
    maxLat: Math.max(bounds.maxLat, latitude)
  }), { minLon: Number.POSITIVE_INFINITY, minLat: Number.POSITIVE_INFINITY, maxLon: Number.NEGATIVE_INFINITY, maxLat: Number.NEGATIVE_INFINITY })
}

function componentOrder(component: number[], edges: Map<number, number[]>, segments: readonly PreparedSegment[]): number[] {
  const inComponent = new Set(component)
  const incoming = new Set<number>()
  for (const from of component) {
    for (const to of edges.get(from) ?? []) if (inComponent.has(to)) incoming.add(to)
  }
  const start = component.find((index) => !incoming.has(index)) ?? component.slice().sort((left, right) => segments[left]!.segment.segmentUid.localeCompare(segments[right]!.segment.segmentUid))[0]!
  const ordered: number[] = []
  const visited = new Set<number>()
  let current: number | undefined = start
  while (current !== undefined && !visited.has(current)) {
    visited.add(current)
    ordered.push(current)
    current = (edges.get(current) ?? [])
      .filter((candidate) => inComponent.has(candidate) && !visited.has(candidate))
      .sort((left, right) => segments[right]!.utility - segments[left]!.utility || segments[left]!.segment.segmentUid.localeCompare(segments[right]!.segment.segmentUid))[0]
  }
  return ordered.concat(component.filter((index) => !visited.has(index)).sort((left, right) => segments[left]!.segment.segmentUid.localeCompare(segments[right]!.segment.segmentUid)))
}

function buildCorridor(
  component: number[],
  edges: Map<number, number[]>,
  segments: readonly PreparedSegment[],
  options: Required<RigCorridorBuildOptions>
): RigCorridor {
  const order = componentOrder(component, edges, segments)
  const orderedSegments = order.map((index) => segments[index]!)
  const totalLength = orderedSegments.reduce((sum, item) => sum + item.segment.lengthMeters, 0)
  const expectedUtility = orderedSegments.reduce((sum, item) => sum + item.utility * item.segment.lengthMeters, 0) / totalLength
  const confidence = orderedSegments.reduce((sum, item) => sum + item.aggregate.evidenceStrength * item.segment.lengthMeters, 0) / totalLength
  const dimensions: Partial<Record<RigDimensionKey, number>> = {}
  for (const key of RIG_DIMENSION_KEYS) {
    const present = orderedSegments.filter((item) => item.aggregate.dimensions[key] !== undefined)
    if (present.length > 0) {
      const weight = present.reduce((sum, item) => sum + item.segment.lengthMeters, 0)
      dimensions[key] = present.reduce((sum, item) => sum + item.aggregate.dimensions[key]! * item.segment.lengthMeters, 0) / weight
    }
  }
  const roleWeights = new Map<RigRouteRole, number>()
  for (const item of orderedSegments) roleWeights.set(item.aggregate.dominantRole, (roleWeights.get(item.aggregate.dominantRole) ?? 0) + item.segment.lengthMeters)
  const dominantRole = [...roleWeights.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "unknown"
  const indegrees = new Map<number, number>()
  const componentSet = new Set(component)
  for (const from of component) for (const to of edges.get(from) ?? []) if (componentSet.has(to)) indegrees.set(to, (indegrees.get(to) ?? 0) + 1)
  const entry = component.find((index) => !indegrees.has(index)) ?? order[0]!
  const exit = component.find((index) => (edges.get(index) ?? []).every((candidate) => !componentSet.has(candidate))) ?? order.at(-1)!
  return {
    corridorId: `${options.sourceBuild}:${orderedSegments[0]!.segment.segmentUid}`,
    segmentUids: orderedSegments.map((item) => item.segment.segmentUid),
    entryNodeId: segments[entry]!.segment.fromOsmNodeId,
    exitNodeId: segments[exit]!.segment.toOsmNodeId,
    lengthMeters: Number(totalLength.toFixed(2)),
    expectedUtility: Number(expectedUtility.toFixed(6)),
    confidence: Number(confidence.toFixed(6)),
    dominantRole,
    dimensions: Object.fromEntries(Object.entries(dimensions).map(([key, value]) => [key, Number(value!.toFixed(6))])) as Partial<Record<RigDimensionKey, number>>,
    bounds: componentBounds(orderedSegments),
    provenance: {
      sourceBuild: options.sourceBuild,
      builtAt: options.builtAt,
      segmentCount: orderedSegments.length,
      observationCount: orderedSegments.reduce((sum, item) => sum + item.aggregate.observationCount, 0),
      independentSourceCount: Math.min(...orderedSegments.map((item) => item.aggregate.independentSourceCount))
    }
  }
}

/** Build contiguous corridors from verified canonical segments and P12 aggregates. */
export function buildRigCorridors(
  input: readonly unknown[],
  inputOptions: RigCorridorBuildOptions
): RigCorridor[] {
  const options = validateCorridorOptions(inputOptions)
  if (input.length > options.maxSegments) throw new Error("RIG corridor input exceeds the maximum segment count")
  const seen = new Set<string>()
  const prepared: PreparedSegment[] = []
  for (const value of input) {
    if (!validateCorridorInput(value)) throw new Error("RIG corridor segment or aggregate is invalid")
    if (seen.has(value.segment.segmentUid)) throw new Error(`Duplicate RIG corridor segment ${value.segment.segmentUid}`)
    seen.add(value.segment.segmentUid)
    const utility = utilityFor(value.aggregate)
    if (utility === null || utility < options.minimumSegmentUtility || value.aggregate.evidenceStrength < options.minimumEvidenceStrength) continue
    prepared.push({ ...value, utility })
  }
  prepared.sort((left, right) => left.segment.segmentUid.localeCompare(right.segment.segmentUid))
  const startCells = new Map<string, number[]>()
  const byStartNode = new Map<string, number[]>()
  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index]!
    const start = item.segment.geometry[0]!
    const cell = cellKey(start, options.connectionRadiusMeters)
    startCells.set(cell, [...(startCells.get(cell) ?? []), index])
    byStartNode.set(item.segment.fromOsmNodeId, [...(byStartNode.get(item.segment.fromOsmNodeId) ?? []), index])
  }
  const edges = new Map<number, number[]>()
  const adjacency = new Map<number, Set<number>>()
  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index]!
    const end = item.segment.geometry.at(-1)!
    const possible = new Set<number>(byStartNode.get(item.segment.toOsmNodeId) ?? [])
    for (const cell of neighboringCells(end, options.connectionRadiusMeters)) for (const candidate of startCells.get(cell) ?? []) possible.add(candidate)
    for (const candidate of possible) {
      if (candidate === index) continue
      const next = prepared[candidate]!
      if (metersBetween(end, next.segment.geometry[0]!) > options.connectionRadiusMeters) continue
      if (characterDistance(item.aggregate, next.aggregate) > options.maximumCharacterDistance) continue
      edges.set(index, [...(edges.get(index) ?? []), candidate])
      const left = adjacency.get(index) ?? new Set<number>()
      const right = adjacency.get(candidate) ?? new Set<number>()
      left.add(candidate)
      right.add(index)
      adjacency.set(index, left)
      adjacency.set(candidate, right)
    }
  }

  const visited = new Set<number>()
  const corridors: RigCorridor[] = []
  for (let start = 0; start < prepared.length; start += 1) {
    if (visited.has(start)) continue
    const component: number[] = []
    const queue = [start]
    visited.add(start)
    while (queue.length > 0) {
      const current = queue.shift()!
      component.push(current)
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    if (component.length > options.maxSegmentsPerCorridor) throw new Error("RIG corridor exceeds the maximum segment count")
    const length = component.reduce((sum, index) => sum + prepared[index]!.segment.lengthMeters, 0)
    if (length < options.minimumContiguousMeters) continue
    if (corridors.length >= options.maxCorridors) throw new Error("RIG corridor output exceeds the maximum corridor count")
    corridors.push(buildCorridor(component, edges, prepared, options))
  }
  return corridors.sort((left, right) => right.expectedUtility - left.expectedUtility || left.corridorId.localeCompare(right.corridorId))
}

/** Build a compact UID-only Web Mercator tile index; geometry stays in the canonical graph. */
export function buildRigSpatialIndex(
  input: readonly unknown[],
  inputOptions: RigSpatialIndexOptions
): RigSpatialIndex {
  const options = validateSpatialOptions(inputOptions)
  if (input.length > options.maxSegments) throw new Error("RIG spatial input exceeds the maximum segment count")
  const seen = new Set<string>()
  const tiles = new Map<string, Set<string>>()
  for (const value of input) {
    if (!validateCanonicalSegment(value)) throw new Error("RIG spatial segment is invalid")
    if (seen.has(value.segmentUid)) throw new Error(`Duplicate RIG spatial segment ${value.segmentUid}`)
    seen.add(value.segmentUid)
    for (const point of value.geometry) addTile(tiles, webMercatorTile(point, options.zoom), value.segmentUid, options.maxTiles)
  }
  return {
    schemaVersion: 1,
    sourceBuild: options.sourceBuild,
    builtAt: options.builtAt,
    zoom: options.zoom,
    tiles: [...tiles.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([tileId, segmentUids]) => ({
      tileId,
      segmentUids: [...segmentUids].sort()
    }))
  }
}
