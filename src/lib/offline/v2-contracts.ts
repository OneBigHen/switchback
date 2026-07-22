/**
 * Offline routing schema v2 contracts.
 *
 * This module is intentionally pure: no network, no IndexedDB, no workers.
 * It defines the implementation-ready shape of offline graph tiles, region
 * manifests, installed-region version tracking, and the legacy-bundle
 * classifier used by the migration shim. All public validators accept
 * `unknown` at their boundary and never throw; corrupt input returns `false`.
 *
 * Non-goals: UI, persistence, download, PBF parsing, router changes.
 */

export const OFFLINE_GRAPH_SCHEMA_V2 = 2 as const

/**
 * Schema versions that {@link classifyLegacyOfflineBundle} may preserve as
 * `legacy_corridor`. v2 and above are intentionally excluded so that future
 * schemas are never silently parsed as v2.
 */
export const CLASSIFY_LEGACY_COMPATIBLE_SCHEMA_VERSIONS: readonly number[] = [1]

/* ------------------------------------------------------------------ *
 * Boundary types
 * ------------------------------------------------------------------ */

export interface OfflineBounds {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

export type OfflineAccessState =
  | "permitted"
  | "designated"
  | "discouraged"
  | "forbidden"

export type OfflineRoadClass =
  | "motorway"
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "unclassified"
  | "residential"
  | "track"
  | "path"
  | "service"

export type OfflineSurface =
  | "asphalt"
  | "concrete"
  | "gravel"
  | "dirt"
  | "paved"
  | "unpaved"
  | "ground"
  | "unknown"

export type OfflineSmoothness =
  | "excellent"
  | "good"
  | "intermediate"
  | "bad"
  | "very_bad"
  | "horrible"

export type OfflineTrackType =
  | "grade1"
  | "grade2"
  | "grade3"
  | "grade4"
  | "grade5"

export interface OfflineProfileWeights {
  quick: number
  twisty: number
  scenic: number
  adventure: number
}

export type OfflineTurnRestrictionKind = "no_turn" | "only_turn"

export interface OfflineTurnRestriction {
  incomingEdgeId: string
  viaNodeId: string
  outgoingEdgeId: string
  restriction: OfflineTurnRestrictionKind
  /** OSM relation id this turn restriction was derived from, if known. */
  sourceRelationId?: string
}

export interface OfflineGraphNodeV2 {
  id: string
  coordinate: [longitude: number, latitude: number]
}

export interface OfflineGraphEdgeV2 {
  id: string
  fromNodeId: string
  toNodeId: string
  /** Ordered polyline of at least two coordinates. */
  geometry: Array<[longitude: number, latitude: number]>
  /** Decimal OSM way identifier. A string keeps the wire format JSON-safe. */
  osmWayId: string
  /** Motorcycle-specific access resolution. */
  motorcycleAccess: OfflineAccessState
  /** General vehicle access resolution (OSM `access=*`). */
  access: OfflineAccessState
  roadClass: OfflineRoadClass
  surface: OfflineSurface
  smoothness?: OfflineSmoothness
  trackType?: OfflineTrackType
  maxSpeedKph?: number
  profileWeights: OfflineProfileWeights
  /** Free-form uncertainty provenance strings (e.g. "inferred_surface"). */
  uncertainty: string[]
}

export interface OfflineGraphTileV2 {
  schemaVersion: typeof OFFLINE_GRAPH_SCHEMA_V2
  tileId: string
  bounds: OfflineBounds
  nodes: OfflineGraphNodeV2[]
  edges: OfflineGraphEdgeV2[]
  turnRestrictions: OfflineTurnRestriction[]
}

/* ------------------------------------------------------------------ *
 * Region manifest
 * ------------------------------------------------------------------ */

export interface OfflineRegionManifestTileEntry {
  tileId: string
  bounds: OfflineBounds
  bytes: number
  sha256: string
  nodeCount: number
  edgeCount: number
}

export interface OfflineRegionManifestChecksums {
  /** Hash of the ordered `tileId:sha256` inventory. */
  inventorySha256: string
}

export interface OfflineRegionManifestV2 {
  schemaVersion: typeof OFFLINE_GRAPH_SCHEMA_V2
  regionId: string
  regionName: string
  /** Immutable, content-addressed region release identifier. */
  version: string
  compression: "zstd-json"
  buildDate: string
  sourceDataDate: string
  snapshotUrl: string
  sourceUrl: string
  bounds: OfflineBounds
  checksums: OfflineRegionManifestChecksums
  attribution: string
  tiles: OfflineRegionManifestTileEntry[]
  tileByteTotal: number
}

/* ------------------------------------------------------------------ *
 * Installed region version tracking
 * ------------------------------------------------------------------ */

export interface InstalledRegionVersionSlot {
  schemaVersion: typeof OFFLINE_GRAPH_SCHEMA_V2
  version: string
  installedAt: string
  manifestSha256: string
}

export type InstalledRegionLifecycle =
  | "pending"
  | "active"
  | "previous"
  | "orphaned"

export interface InstalledRegionVersion {
  regionId: string
  pending?: InstalledRegionVersionSlot
  active?: InstalledRegionVersionSlot
  previous?: InstalledRegionVersionSlot
  lifecycle: InstalledRegionLifecycle
}

/* ------------------------------------------------------------------ *
 * Failure codes (discriminated)
 * ------------------------------------------------------------------ */

export type OfflineV2ValidationFailureCode =
  | "wrong_schema_version"
  | "corrupt_identifier"
  | "corrupt_hash"
  | "corrupt_geometry"
  | "missing_reference"
  | "illegal_weight"
  | "invalid_turn_restriction"
  | "invalid_bounds"
  | "invalid_attribution"
  | "invalid_inventory"
  | "invalid_lifecycle"

export type OfflineV2ClassificationFailureCode =
  | "unrecognized_legacy_shape"
  | "future_schema_version"
  | "v2_bundle_passed_to_legacy_classifier"

/* ------------------------------------------------------------------ *
 * Internal validation primitives
 * ------------------------------------------------------------------ */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isNonNegativeFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  )
}

const HEX64 = /^[0-9a-fA-F]{64}$/

function isSha256Hex(value: unknown): boolean {
  return typeof value === "string" && HEX64.test(value)
}

const ACCESS_STATES: readonly OfflineAccessState[] = [
  "permitted",
  "designated",
  "discouraged",
  "forbidden"
]
const ROAD_CLASSES: readonly OfflineRoadClass[] = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "track",
  "path",
  "service"
]
const SURFACES: readonly OfflineSurface[] = [
  "asphalt",
  "concrete",
  "gravel",
  "dirt",
  "paved",
  "unpaved",
  "ground",
  "unknown"
]
const SMOOTHNESS: readonly OfflineSmoothness[] = [
  "excellent",
  "good",
  "intermediate",
  "bad",
  "very_bad",
  "horrible"
]
const TRACK_TYPES: readonly OfflineTrackType[] = [
  "grade1",
  "grade2",
  "grade3",
  "grade4",
  "grade5"
]
const TURN_KINDS: readonly OfflineTurnRestrictionKind[] = ["no_turn", "only_turn"]
const LIFECYCLES: readonly InstalledRegionLifecycle[] = [
  "pending",
  "active",
  "previous",
  "orphaned"
]

function isOneOf<T extends string>(
  value: unknown,
  set: readonly T[]
): value is T {
  return typeof value === "string" && (set as readonly string[]).includes(value)
}

function isCoordinate(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  )
}

function isGeometry(
  value: unknown
): value is Array<[longitude: number, latitude: number]> {
  if (!Array.isArray(value) || value.length < 2) return false
  for (const pt of value) {
    if (!isCoordinate(pt)) return false
  }
  return true
}

function isDecimalIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)
}

function isProfileWeights(value: unknown): value is OfflineProfileWeights {
  if (!isObject(value)) return false
  const { quick, twisty, scenic, adventure } = value
  return (
    isNonNegativeFinite(quick) &&
    isNonNegativeFinite(twisty) &&
    isNonNegativeFinite(scenic) &&
    isNonNegativeFinite(adventure)
  )
}

function isBounds(value: unknown): value is OfflineBounds {
  if (!isObject(value)) return false
  const { minLon, minLat, maxLon, maxLat } = value
  return (
    isFiniteNumber(minLon) &&
    isFiniteNumber(minLat) &&
    isFiniteNumber(maxLon) &&
    isFiniteNumber(maxLat) &&
    minLon <= maxLon &&
    minLat <= maxLat &&
    Math.abs(minLon) <= 180 &&
    Math.abs(maxLon) <= 180 &&
    Math.abs(minLat) <= 90 &&
    Math.abs(maxLat) <= 90
  )
}

/* ------------------------------------------------------------------ *
 * Tile validation
 * ------------------------------------------------------------------ */

export function validateOfflineGraphTileV2(input: unknown): boolean {
  if (!isObject(input)) return false

  const { schemaVersion, tileId, bounds, nodes, edges, turnRestrictions } =
    input

  if (schemaVersion !== OFFLINE_GRAPH_SCHEMA_V2) return false
  if (!isNonEmptyString(tileId)) return false
  if (!isBounds(bounds)) return false
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return false
  if (!Array.isArray(turnRestrictions)) return false

  const nodeIds = new Set<string>()
  for (const n of nodes) {
    if (!isObject(n)) return false
    const { id, coordinate } = n
    if (!isNonEmptyString(id)) return false
    if (nodeIds.has(id)) return false
    nodeIds.add(id)
    if (!isCoordinate(coordinate)) return false
  }

  const edgeIds = new Set<string>()
  for (const e of edges) {
    if (!isObject(e)) return false
    const {
      id,
      fromNodeId,
      toNodeId,
      geometry,
      osmWayId,
      motorcycleAccess,
      access,
      roadClass,
      surface,
      smoothness,
      trackType,
      maxSpeedKph,
      profileWeights,
      uncertainty
    } = e

    if (!isNonEmptyString(id)) return false
    if (edgeIds.has(id)) return false
    edgeIds.add(id)
    if (!isNonEmptyString(fromNodeId) || !nodeIds.has(fromNodeId)) return false
    if (!isNonEmptyString(toNodeId) || !nodeIds.has(toNodeId)) return false
    if (!isGeometry(geometry)) return false
    if (!isDecimalIdentifier(osmWayId)) return false
    if (!isOneOf(motorcycleAccess, ACCESS_STATES)) return false
    if (!isOneOf(access, ACCESS_STATES)) return false
    if (!isOneOf(roadClass, ROAD_CLASSES)) return false
    if (!isOneOf(surface, SURFACES)) return false

    if (smoothness !== undefined && !isOneOf(smoothness, SMOOTHNESS)) {
      return false
    }
    if (trackType !== undefined && !isOneOf(trackType, TRACK_TYPES)) {
      return false
    }
    if (
      maxSpeedKph !== undefined &&
      !(isFiniteNumber(maxSpeedKph) && maxSpeedKph > 0)
    ) {
      return false
    }
    if (!isProfileWeights(profileWeights)) return false
    if (!Array.isArray(uncertainty)) return false
    for (const u of uncertainty) {
      if (typeof u !== "string") return false
    }
  }

  // Turn restrictions: every reference must resolve to an extant edge/node,
  // and the viaNode must actually be the meeting point of the incoming and
  // outgoing edges (incoming.toNodeId == via AND outgoing.fromNodeId == via
  // OR the symmetric reverse-direction case for explicitly directed edges).
  const restrictionSignatures = new Set<string>()

  const findEdge = (id: string): OfflineGraphEdgeV2 | undefined =>
    edges.find((e) => (e as OfflineGraphEdgeV2).id === id) as
      | OfflineGraphEdgeV2
      | undefined

  for (const r of turnRestrictions) {
    if (!isObject(r)) return false
    const {
      incomingEdgeId,
      viaNodeId,
      outgoingEdgeId,
      restriction,
      sourceRelationId
    } = r

    if (!isNonEmptyString(incomingEdgeId)) return false
    if (!isNonEmptyString(viaNodeId)) return false
    if (!isNonEmptyString(outgoingEdgeId)) return false
    if (!isOneOf(restriction, TURN_KINDS)) return false
    if (
      sourceRelationId !== undefined &&
      !isDecimalIdentifier(sourceRelationId)
    ) {
      return false
    }
    if (!nodeIds.has(viaNodeId)) return false

    const incoming = findEdge(incomingEdgeId)
    const outgoing = findEdge(outgoingEdgeId)
    if (incoming === undefined || outgoing === undefined) return false

    const viaMatchesIncoming =
      incoming.fromNodeId === viaNodeId || incoming.toNodeId === viaNodeId
    const viaMatchesOutgoing =
      outgoing.fromNodeId === viaNodeId || outgoing.toNodeId === viaNodeId
    if (!viaMatchesIncoming || !viaMatchesOutgoing) return false

    const signature = `${incomingEdgeId}|${viaNodeId}|${outgoingEdgeId}|${restriction}`
    if (restrictionSignatures.has(signature)) return false
    restrictionSignatures.add(signature)
  }

  return true
}

/* ------------------------------------------------------------------ *
 * Manifest validation
 * ------------------------------------------------------------------ */

export function validateOfflineRegionManifestV2(
  input: unknown
): input is OfflineRegionManifestV2 {
  if (!isObject(input)) return false

  const {
    schemaVersion,
    regionId,
    regionName,
    version,
    compression,
    buildDate,
    sourceDataDate,
    snapshotUrl,
    sourceUrl,
    bounds,
    checksums,
    attribution,
    tiles,
    tileByteTotal
  } = input

  if (schemaVersion !== OFFLINE_GRAPH_SCHEMA_V2) return false
  if (!isNonEmptyString(regionId)) return false
  if (!isNonEmptyString(regionName)) return false
  if (!isNonEmptyString(version)) return false
  if (compression !== "zstd-json") return false
  if (!isNonEmptyString(buildDate)) return false
  if (!isNonEmptyString(sourceDataDate)) return false
  if (!isNonEmptyString(snapshotUrl)) return false
  if (!isNonEmptyString(sourceUrl)) return false
  if (!isBounds(bounds)) return false

  if (!isObject(checksums)) return false
  const { inventorySha256 } = checksums
  if (!isSha256Hex(inventorySha256)) return false

  if (!isNonEmptyString(attribution)) return false
  if (!Array.isArray(tiles) || tiles.length === 0) return false

  const tileIds = new Set<string>()
  for (const t of tiles) {
    if (!isObject(t)) return false
    const { tileId, bounds: tileBounds, bytes, sha256, nodeCount, edgeCount } = t
    if (!isNonEmptyString(tileId)) return false
    if (tileIds.has(tileId)) return false
    tileIds.add(tileId)
    if (!isBounds(tileBounds)) return false
    if (!isNonNegativeFinite(bytes) || bytes <= 0) return false
    if (!isSha256Hex(sha256)) return false
    if (!isPositiveInteger(nodeCount) || !isPositiveInteger(edgeCount)) {
      return false
    }
  }

  if (!isNonNegativeFinite(tileByteTotal) || tileByteTotal <= 0) return false
  const inventoryBytes = tiles.reduce(
    (sum, tile) => sum + Number((tile as Record<string, unknown>).bytes),
    0
  )
  if (inventoryBytes !== tileByteTotal) return false

  return true
}

/* ------------------------------------------------------------------ *
 * Installed region version validation
 * ------------------------------------------------------------------ */

function isInstallSlot(value: unknown): value is InstalledRegionVersionSlot {
  if (!isObject(value)) return false
  const { schemaVersion, version, installedAt, manifestSha256 } = value
  return (
    schemaVersion === OFFLINE_GRAPH_SCHEMA_V2 &&
    isNonEmptyString(version) &&
    isNonEmptyString(installedAt) &&
    isSha256Hex(manifestSha256)
  )
}

export function validateInstalledRegionVersion(input: unknown): boolean {
  if (!isObject(input)) return false
  const { regionId, pending, active, previous, lifecycle } = input

  if (!isNonEmptyString(regionId)) return false
  if (!isOneOf(lifecycle, LIFECYCLES)) return false

  if (pending !== undefined && !isInstallSlot(pending)) return false
  if (active !== undefined && !isInstallSlot(active)) return false
  if (previous !== undefined && !isInstallSlot(previous)) return false

  // An "active" lifecycle is meaningless without an active slot.
  if (lifecycle === "active" && active === undefined) return false
  // "pending" lifecycle requires either a pending slot or an active slot
  // already present (the latter represents the in-progress flip).
  if (lifecycle === "pending" && pending === undefined && active === undefined) {
    return false
  }

  return true
}

/* ------------------------------------------------------------------ *
 * Legacy bundle classification
 * ------------------------------------------------------------------ */

export type LegacyOfflineBundleClassification =
  | {
      kind: "legacy_corridor"
      consumable: true
      schemaVersion: number
    }
  | {
      kind: "update_required"
      consumable: false
      schemaVersion: number | null
      code: OfflineV2ClassificationFailureCode
    }

/**
 * Classify a persisted offline bundle of unknown shape into a v2-aware
 * migration outcome. v1 corridor packs are preserved as `legacy_corridor`
 * because the v1 corridor format remains consumable by the v1 worker. Any
 * v1 regional bundle, unrecognized v1 shape, v2 bundle handed to this
 * legacy classifier, or future-schema bundle is labelled `update_required`
 * — never silently parsed as v2.
 */
export function classifyLegacyOfflineBundle(
  input: unknown
): LegacyOfflineBundleClassification {
  if (!isObject(input)) {
    return {
      kind: "update_required",
      consumable: false,
      schemaVersion: null,
      code: "unrecognized_legacy_shape"
    }
  }

  const { kind, schemaVersion } = input
  const version =
    typeof schemaVersion === "number" && Number.isFinite(schemaVersion)
      ? schemaVersion
      : null

  // v2 or anything beyond the legacy-compatible window must never be
  // silently parsed by the v2 runtime.
  if (version !== null && version >= OFFLINE_GRAPH_SCHEMA_V2) {
    return {
      kind: "update_required",
      consumable: false,
      schemaVersion: version,
      code:
        version === OFFLINE_GRAPH_SCHEMA_V2
          ? "v2_bundle_passed_to_legacy_classifier"
          : "future_schema_version"
    }
  }

  // Only v1 (and any other explicitly compatible legacy schema versions)
  // are eligible for graceful preservation.
  if (
    version === null ||
    !CLASSIFY_LEGACY_COMPATIBLE_SCHEMA_VERSIONS.includes(version)
  ) {
    return {
      kind: "update_required",
      consumable: false,
      schemaVersion: version,
      code: "unrecognized_legacy_shape"
    }
  }

  if (kind === "corridor") {
    return {
      kind: "legacy_corridor",
      consumable: true,
      schemaVersion: version
    }
  }

  // v1 regional bundles (and any other v1 non-corridor shape) are not
  // consumable by the v2 runtime and must trigger an update.
  return {
    kind: "update_required",
    consumable: false,
    schemaVersion: version,
    code: "unrecognized_legacy_shape"
  }
}
