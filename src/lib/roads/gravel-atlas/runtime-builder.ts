import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { Coordinate } from "@/lib/routing/types"
import type { GravelAtlasOfficialSourceId } from "./sources"
import { GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION } from "./traversability"

export interface GravelAtlasSourceFeatureRef {
  sourceId: GravelAtlasOfficialSourceId
  sourceFeatureId: string
}

export interface VerifiedGravelAtlasCorridorInput {
  id: string
  label: string
  geometry: Coordinate[]
  verifiedGravelMeters: number
  longestContinuousGravelMeters: number
  fragmentCount: number
  confidence: number
  verification: "routable"
  /** Stable graph identity; provider edge ids are explicitly not accepted. */
  canonicalSegmentIds: string[]
  sourceFeatureRefs: GravelAtlasSourceFeatureRef[]
}

export interface BuildGravelAtlasRuntimeDatabaseOptions {
  stagingDatabasePath: string
  databasePath: string
  graphFingerprint: string
  /**
   * Source fingerprint the corridors were reconciled and verified against.
   * The build refuses a staging snapshot with any other fingerprint, so old
   * corridors can never be republished under a newer source identity.
   */
  expectedSourceFingerprint?: string
  traversabilityPolicyVersion: number
  corridors: readonly VerifiedGravelAtlasCorridorInput[]
}

/** Parse the live-router verification artifact that runtime publication consumes. */
export function parseVerifiedRuntimeInput(value: unknown): {
  graphFingerprint: string
  sourceFingerprint: string
  traversabilityPolicyVersion: number
  corridors: VerifiedGravelAtlasCorridorInput[]
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Verified Gravel Atlas build input must be a JSON object")
  }
  const input = value as Record<string, unknown>
  if (typeof input.graphFingerprint !== "string" || !input.graphFingerprint.trim()) {
    throw new Error("Verified Gravel Atlas build input needs graphFingerprint")
  }
  if (typeof input.sourceFingerprint !== "string" || !input.sourceFingerprint.trim()) {
    throw new Error("Verified Gravel Atlas build input needs sourceFingerprint")
  }
  if (input.traversabilityPolicyVersion !== GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION) {
    throw new Error(
      `Verified Gravel Atlas build input uses unsupported traversability policy ` +
      `${String(input.traversabilityPolicyVersion)}; expected ${GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION}`
    )
  }
  if (!Array.isArray(input.corridors)) throw new Error("Verified Gravel Atlas build input needs a corridors array")
  return {
    graphFingerprint: input.graphFingerprint.trim(),
    sourceFingerprint: input.sourceFingerprint.trim(),
    traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
    corridors: input.corridors as VerifiedGravelAtlasCorridorInput[]
  }
}

export interface GravelAtlasRuntimeBuildResult {
  databasePath: string
  graphFingerprint: string
  sourceFingerprint: string
  traversabilityPolicyVersion: number
  corridorCount: number
}

interface StagingManifestRow {
  schema_version: number
  source_fingerprint: string
}

/** Runtime schema v2 adds explicit traversability-policy identity. */
export const GRAVEL_ATLAS_RUNTIME_SCHEMA_VERSION = 2
const SHA256_HEX = /^[0-9a-f]{64}$/

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90
}

function boundsFor(geometry: readonly Coordinate[]) {
  if (geometry.length < 2 || !geometry.every(isCoordinate)) {
    throw new Error("A verified Gravel Atlas corridor needs at least two valid coordinates")
  }
  const longitudes = geometry.map((coordinate) => coordinate[0])
  const latitudes = geometry.map((coordinate) => coordinate[1])
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes)
  }
}

function nonEmptyUniqueStrings(values: readonly string[], label: string): string[] {
  const normalized = values.map((value) => value.trim()).filter(Boolean)
  if (normalized.length === 0) throw new Error(`${label} are required`)
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must be unique`)
  return normalized.sort()
}

function validateCorridor(corridor: VerifiedGravelAtlasCorridorInput): void {
  if (!corridor.id.trim() || !corridor.label.trim()) throw new Error("Verified Gravel Atlas corridor id and label are required")
  boundsFor(corridor.geometry)
  if (!Number.isFinite(corridor.verifiedGravelMeters) || corridor.verifiedGravelMeters <= 0) {
    throw new Error(`Verified gravel distance must be positive for ${corridor.id}`)
  }
  if (!Number.isFinite(corridor.longestContinuousGravelMeters) || corridor.longestContinuousGravelMeters <= 0 ||
      corridor.longestContinuousGravelMeters > corridor.verifiedGravelMeters) {
    throw new Error(`Continuous gravel distance is invalid for ${corridor.id}`)
  }
  if (!Number.isInteger(corridor.fragmentCount) || corridor.fragmentCount < 1) {
    throw new Error(`Fragment count is invalid for ${corridor.id}`)
  }
  if (!Number.isFinite(corridor.confidence) || corridor.confidence < 0 || corridor.confidence > 1) {
    throw new Error(`Confidence is invalid for ${corridor.id}`)
  }
  if (corridor.verification !== "routable") throw new Error(`Corridor ${corridor.id} is not graph-routable`)
  nonEmptyUniqueStrings(corridor.canonicalSegmentIds, `Canonical segment ids for ${corridor.id}`)
  if (corridor.sourceFeatureRefs.length === 0) throw new Error(`Source feature references are required for ${corridor.id}`)
}

function stagingManifest(database: DatabaseSync): StagingManifestRow {
  const row = database.prepare(`
    select schema_version, source_fingerprint
    from gravel_source_manifest
    limit 1
  `).get() as unknown as StagingManifestRow | undefined
  if (!row || row.schema_version !== 1 || !SHA256_HEX.test(row.source_fingerprint)) {
    throw new Error("Gravel Atlas staging manifest is missing or invalid")
  }
  return row
}

function verifySourceReferences(
  database: DatabaseSync,
  corridor: VerifiedGravelAtlasCorridorInput
): string[] {
  const refs = new Set<string>()
  const statement = database.prepare(`
    select 1
    from gravel_source_observations
    where source_id = ? and source_feature_id = ?
    limit 1
  `)
  for (const ref of corridor.sourceFeatureRefs) {
    const sourceFeatureId = ref.sourceFeatureId.trim()
    if (!sourceFeatureId || !statement.get(ref.sourceId, sourceFeatureId)) {
      throw new Error(`Unknown staged source feature ${ref.sourceId}:${sourceFeatureId || "<blank>"}`)
    }
    refs.add(`${ref.sourceId}:${sourceFeatureId}`)
  }
  return [...refs].sort()
}

/**
 * Build the route-time Gravel Atlas only from data that has already passed the
 * graph reconciliation and live traversability boundaries. The builder verifies
 * every source reference, requires stable canonical segment identities, stamps
 * source/graph/policy identity, and replaces the prior runtime file only after
 * a successful transaction.
 */
export function buildGravelAtlasRuntimeDatabase(
  options: BuildGravelAtlasRuntimeDatabaseOptions
): GravelAtlasRuntimeBuildResult {
  const graphFingerprint = options.graphFingerprint.trim()
  if (!graphFingerprint) throw new Error("A routing graph fingerprint is required")
  if (options.traversabilityPolicyVersion !== GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION) {
    throw new Error(
      `Unsupported Gravel Atlas traversability policy ${String(options.traversabilityPolicyVersion)}; ` +
      `expected ${GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION}`
    )
  }
  const ids = new Set<string>()
  for (const corridor of options.corridors) {
    validateCorridor(corridor)
    if (ids.has(corridor.id)) throw new Error(`Duplicate Gravel Atlas corridor ${corridor.id}`)
    ids.add(corridor.id)
  }

  const staging = new DatabaseSync(path.resolve(options.stagingDatabasePath), { readOnly: true })
  let manifest: StagingManifestRow
  const sourceIdsByCorridor = new Map<string, string[]>()
  try {
    manifest = stagingManifest(staging)
    const expected = options.expectedSourceFingerprint?.trim()
    if (expected !== undefined && expected !== manifest.source_fingerprint) {
      throw new Error(
        `Verified corridors were built for source fingerprint ${expected || "(empty)"}, ` +
        `but the staging snapshot has ${manifest.source_fingerprint}; re-run reconciliation and verification`
      )
    }
    for (const corridor of options.corridors) {
      sourceIdsByCorridor.set(corridor.id, verifySourceReferences(staging, corridor))
    }
  } finally {
    staging.close()
  }

  const databasePath = path.resolve(options.databasePath)
  const directory = path.dirname(databasePath)
  mkdirSync(directory, { recursive: true })
  const temporaryPath = path.join(
    directory,
    `.${path.basename(databasePath)}.${process.pid}.${Date.now()}.tmp`
  )
  rmSync(temporaryPath, { force: true })
  const database = new DatabaseSync(temporaryPath)

  try {
    database.exec(`
      pragma journal_mode = DELETE;
      pragma synchronous = FULL;
      create table gravel_atlas_metadata (
        schema_version integer not null,
        source_fingerprint text not null,
        graph_fingerprint text not null,
        traversability_policy_version integer not null,
        corridor_count integer not null
      );
      create table gravel_atlas_corridors (
        id text primary key,
        label text not null,
        geometry text not null,
        verified_gravel_meters real not null,
        longest_continuous_gravel_meters real not null,
        fragment_count integer not null,
        confidence real not null,
        verification_status text not null,
        source_ids text not null,
        canonical_segment_ids text not null,
        source_fingerprint text not null,
        graph_fingerprint text not null,
        west real not null,
        south real not null,
        east real not null,
        north real not null
      );
      create index idx_gravel_atlas_bounds
        on gravel_atlas_corridors(west, east, south, north);
      create index idx_gravel_atlas_build
        on gravel_atlas_corridors(graph_fingerprint, source_fingerprint, verification_status);
    `)
    const insert = database.prepare(`
      insert into gravel_atlas_corridors (
        id, label, geometry, verified_gravel_meters,
        longest_continuous_gravel_meters, fragment_count, confidence,
        verification_status, source_ids, canonical_segment_ids,
        source_fingerprint, graph_fingerprint, west, south, east, north
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    database.exec("begin immediate")
    for (const corridor of [...options.corridors].sort((left, right) => left.id.localeCompare(right.id))) {
      const bounds = boundsFor(corridor.geometry)
      insert.run(
        corridor.id.trim(),
        corridor.label.trim(),
        JSON.stringify(corridor.geometry),
        corridor.verifiedGravelMeters,
        corridor.longestContinuousGravelMeters,
        corridor.fragmentCount,
        corridor.confidence,
        "routable",
        JSON.stringify(sourceIdsByCorridor.get(corridor.id) ?? []),
        JSON.stringify(nonEmptyUniqueStrings(corridor.canonicalSegmentIds, `Canonical segment ids for ${corridor.id}`)),
        manifest.source_fingerprint,
        graphFingerprint,
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north
      )
    }
    database.prepare(`
      insert into gravel_atlas_metadata (
        schema_version, source_fingerprint, graph_fingerprint,
        traversability_policy_version, corridor_count
      ) values (?, ?, ?, ?, ?)
    `).run(
      GRAVEL_ATLAS_RUNTIME_SCHEMA_VERSION,
      manifest.source_fingerprint,
      graphFingerprint,
      GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
      options.corridors.length
    )
    database.exec("commit")
    database.close()
    renameSync(temporaryPath, databasePath)
    return {
      databasePath,
      graphFingerprint,
      sourceFingerprint: manifest.source_fingerprint,
      traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
      corridorCount: options.corridors.length
    }
  } catch (error) {
    try { database.exec("rollback") } catch { /* no active transaction */ }
    try { database.close() } catch { /* already closed */ }
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true })
    throw error
  }
}
