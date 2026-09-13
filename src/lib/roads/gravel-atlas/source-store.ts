import { createHash } from "node:crypto"
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
  officialSourceSnapshotFingerprint,
  type OfficialSourceSnapshot
} from "./source-snapshot"
import { GRAVEL_ATLAS_SOURCE_POLICIES, type GravelEvidenceObservation } from "./sources"

export interface WriteOfficialSourceSnapshotsOptions {
  databasePath: string
  snapshots: readonly OfficialSourceSnapshot[]
}

export interface GravelAtlasSourceStoreResult {
  databasePath: string
  sourceFingerprint: string
  sourceCount: number
  observationCount: number
}

const SOURCE_STORE_SCHEMA_VERSION = 1
const SHA256_HEX = /^[0-9a-f]{64}$/

function sourceStoreFingerprint(snapshots: readonly OfficialSourceSnapshot[]): string {
  const sources = [...snapshots]
    .map((snapshot) => ({ sourceId: snapshot.sourceId, fingerprint: snapshot.fingerprint }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
  return createHash("sha256")
    .update(JSON.stringify({ version: SOURCE_STORE_SCHEMA_VERSION, sources }))
    .digest("hex")
}

function boundsFor(observation: GravelEvidenceObservation) {
  if (observation.geometry.length < 2) throw new Error("A staged gravel observation needs at least two coordinates")
  const longitudes = observation.geometry.map((coordinate) => coordinate[0])
  const latitudes = observation.geometry.map((coordinate) => coordinate[1])
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes)
  }
}

function validateSnapshots(snapshots: readonly OfficialSourceSnapshot[]): void {
  if (snapshots.length === 0) throw new Error("At least one official Gravel Atlas source snapshot is required")
  const sourceIds = new Set<string>()
  for (const snapshot of snapshots) {
    if (sourceIds.has(snapshot.sourceId)) throw new Error(`Duplicate Gravel Atlas source snapshot ${snapshot.sourceId}`)
    sourceIds.add(snapshot.sourceId)
    if (!SHA256_HEX.test(snapshot.fingerprint)) throw new Error(`Invalid snapshot fingerprint for ${snapshot.sourceId}`)
    const expected = officialSourceSnapshotFingerprint(snapshot.sourceId, snapshot.observations)
    if (snapshot.fingerprint !== expected) throw new Error(`Snapshot fingerprint mismatch for ${snapshot.sourceId}`)
    if (snapshot.stats.acceptedFeatures !== snapshot.observations.length) {
      throw new Error(`Snapshot statistics do not match accepted observations for ${snapshot.sourceId}`)
    }
    const featureIds = new Set<string>()
    for (const observation of snapshot.observations) {
      if (observation.sourceId !== snapshot.sourceId) {
        throw new Error(`Observation source does not match snapshot ${snapshot.sourceId}`)
      }
      if (featureIds.has(observation.sourceFeatureId)) {
        throw new Error(`Duplicate staged feature ${snapshot.sourceId}:${observation.sourceFeatureId}`)
      }
      featureIds.add(observation.sourceFeatureId)
      boundsFor(observation)
    }
  }
}

/**
 * Materialize normalized official-source snapshots into a deterministic local
 * staging database. The build is written beside the destination and renamed
 * only after every row commits, so a failed refresh cannot destroy the last
 * usable snapshot.
 */
export function writeOfficialSourceSnapshots(
  options: WriteOfficialSourceSnapshotsOptions
): GravelAtlasSourceStoreResult {
  const databasePath = path.resolve(options.databasePath)
  validateSnapshots(options.snapshots)
  const sourceFingerprint = sourceStoreFingerprint(options.snapshots)
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
      create table gravel_source_manifest (
        schema_version integer not null,
        source_fingerprint text not null,
        source_count integer not null,
        observation_count integer not null
      );
      create table gravel_source_snapshots (
        source_id text primary key,
        fingerprint text not null,
        region text not null,
        accepted_count integer not null,
        fetched_count integer not null,
        rejected_count integer not null,
        duplicate_count integer not null,
        source_policy_json text not null
      );
      create table gravel_source_observations (
        source_id text not null,
        source_feature_id text not null,
        region text not null,
        road_name text,
        county text,
        jurisdiction text,
        surface_evidence text not null,
        access_evidence text not null,
        status_evidence text not null,
        inspected integer,
        source_updated_at text,
        geometry text not null,
        west real not null,
        south real not null,
        east real not null,
        north real not null,
        primary key (source_id, source_feature_id),
        foreign key (source_id) references gravel_source_snapshots(source_id)
      );
      create index idx_gravel_source_observation_bounds
        on gravel_source_observations(west, east, south, north);
    `)

    const sourceStatement = database.prepare(`
      insert into gravel_source_snapshots (
        source_id, fingerprint, region, accepted_count, fetched_count,
        rejected_count, duplicate_count, source_policy_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const observationStatement = database.prepare(`
      insert into gravel_source_observations (
        source_id, source_feature_id, region, road_name, county, jurisdiction,
        surface_evidence, access_evidence, status_evidence, inspected,
        source_updated_at, geometry, west, south, east, north
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    database.exec("begin immediate")
    let observationCount = 0
    for (const snapshot of [...options.snapshots].sort((left, right) => left.sourceId.localeCompare(right.sourceId))) {
      const policy = GRAVEL_ATLAS_SOURCE_POLICIES[snapshot.sourceId]
      sourceStatement.run(
        snapshot.sourceId,
        snapshot.fingerprint,
        policy.region,
        snapshot.stats.acceptedFeatures,
        snapshot.stats.fetchedFeatures,
        snapshot.stats.rejectedFeatures,
        snapshot.stats.duplicateFeatures,
        JSON.stringify(policy)
      )
      for (const observation of [...snapshot.observations].sort((left, right) => left.sourceFeatureId.localeCompare(right.sourceFeatureId))) {
        const bounds = boundsFor(observation)
        observationStatement.run(
          observation.sourceId,
          observation.sourceFeatureId,
          observation.region,
          observation.roadName ?? null,
          observation.county ?? null,
          observation.jurisdiction ?? null,
          observation.surfaceEvidence,
          observation.accessEvidence,
          observation.statusEvidence,
          observation.inspected === null ? null : observation.inspected ? 1 : 0,
          observation.sourceUpdatedAt ?? null,
          JSON.stringify(observation.geometry),
          bounds.west,
          bounds.south,
          bounds.east,
          bounds.north
        )
        observationCount += 1
      }
    }
    database.prepare(`
      insert into gravel_source_manifest (
        schema_version, source_fingerprint, source_count, observation_count
      ) values (?, ?, ?, ?)
    `).run(SOURCE_STORE_SCHEMA_VERSION, sourceFingerprint, options.snapshots.length, observationCount)
    database.exec("commit")
    database.close()

    renameSync(temporaryPath, databasePath)
    return {
      databasePath,
      sourceFingerprint,
      sourceCount: options.snapshots.length,
      observationCount
    }
  } catch (error) {
    try { database.exec("rollback") } catch { /* no active transaction */ }
    try { database.close() } catch { /* already closed */ }
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true })
    throw error
  }
}
