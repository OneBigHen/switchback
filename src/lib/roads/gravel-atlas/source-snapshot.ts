import { createHash } from "node:crypto"
import {
  GRAVEL_ATLAS_SOURCE_POLICIES,
  buildArcGisGeoJsonPageUrl,
  normalizeNjginUnimprovedFeature,
  normalizePaPasda2012Feature,
  type GravelAtlasOfficialSourceId,
  type GravelEvidenceObservation
} from "./sources"

export type ArcGisPageFetcher = (url: string) => Promise<unknown>

export interface OfficialSourceSnapshotStats {
  pages: number
  fetchedFeatures: number
  acceptedFeatures: number
  rejectedFeatures: number
  duplicateFeatures: number
}

export interface OfficialSourceSnapshot {
  sourceId: GravelAtlasOfficialSourceId
  observations: GravelEvidenceObservation[]
  /**
   * Stable hash of the normalized source contract plus accepted observations.
   * Fetch time is intentionally excluded so unchanged data yields the same id.
   */
  fingerprint: string
  stats: OfficialSourceSnapshotStats
  /** Recorded production-use authorization for a restricted source (audit only; not fingerprinted). */
  authorizationReference?: string
}

export interface CollectOfficialSourceSnapshotOptions {
  fetchPage?: ArcGisPageFetcher
  pageSize?: number
  maxPages?: number
  /**
   * Required for a source whose terms restrict reproduction/redistribution: a
   * non-empty reference to the recorded production-use authorization. It is
   * copied onto the snapshot for audit. Operator tooling never supplies one
   * today (see `resolveOperatorSourceIds`).
   */
  authorization?: { reference: string }
}

const SNAPSHOT_SCHEMA_VERSION = 1
const DEFAULT_PAGE_SIZE = 1_000
const DEFAULT_MAX_PAGES = 100
const HARD_MAX_PAGE_SIZE = 2_000
const HARD_MAX_PAGES = 10_000

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseFeatureCollection(value: unknown): { features: unknown[]; exceededTransferLimit: boolean } {
  const payload = record(value)
  if (!payload || payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    const serviceMessage = record(payload?.error)?.message
    throw new Error(
      typeof serviceMessage === "string" && serviceMessage.trim()
        ? `ArcGIS service error: ${serviceMessage.trim()}`
        : "ArcGIS source returned an invalid FeatureCollection payload"
    )
  }
  const properties = record(payload.properties)
  return {
    features: payload.features,
    // ArcGIS reports more rows either at the top level or under properties.
    exceededTransferLimit: payload.exceededTransferLimit === true || properties?.exceededTransferLimit === true
  }
}

function normalizeFeature(
  sourceId: GravelAtlasOfficialSourceId,
  feature: unknown
): GravelEvidenceObservation | null {
  if (!record(feature)) return null
  return sourceId === "pa-pasda-2012"
    ? normalizePaPasda2012Feature(feature)
    : normalizeNjginUnimprovedFeature(feature)
}

function serializedObservation(observation: GravelEvidenceObservation): string {
  return JSON.stringify(observation)
}

function sortObservations(observations: Iterable<GravelEvidenceObservation>): GravelEvidenceObservation[] {
  return [...observations].sort((left, right) =>
    left.sourceFeatureId.localeCompare(right.sourceFeatureId) ||
    serializedObservation(left).localeCompare(serializedObservation(right))
  )
}

export function officialSourceSnapshotFingerprint(
  sourceId: GravelAtlasOfficialSourceId,
  observations: readonly GravelEvidenceObservation[]
): string {
  const policy = GRAVEL_ATLAS_SOURCE_POLICIES[sourceId]
  const contract = {
    version: SNAPSHOT_SCHEMA_VERSION,
    sourceId,
    serviceUrl: policy.serviceUrl,
    where: policy.where,
    outFields: [...policy.outFields],
    observations: sortObservations(observations)
  }
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex")
}

const PAGE_TIMEOUT_MS = 30_000

async function defaultFetchPage(url: string): Promise<unknown> {
  // Bounds both the connection and the body read.
  const response = await fetch(url, {
    headers: { accept: "application/geo+json, application/json" },
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`ArcGIS source request failed with HTTP ${response.status}`)
  }
  try {
    return await response.json()
  } catch {
    throw new Error("ArcGIS source returned invalid JSON")
  }
}

/**
 * Fetch and normalize a complete, bounded official-source snapshot.
 *
 * This belongs in an explicit build/ingest command, never rider request-time
 * routing. It intentionally requests one deterministic page at a time and
 * fails on unstable duplicate IDs instead of silently creating mixed snapshots.
 */
export async function collectOfficialSourceSnapshot(
  sourceId: GravelAtlasOfficialSourceId,
  options: CollectOfficialSourceSnapshotOptions = {}
): Promise<OfficialSourceSnapshot> {
  const policy = GRAVEL_ATLAS_SOURCE_POLICIES[sourceId]
  const authorizationReference = options.authorization?.reference?.trim() ?? ""
  if (policy.redistribution === "permission-required" && !authorizationReference) {
    throw new Error(
      `${policy.label} has restricted reproduction/redistribution terms; fetching it requires a recorded production-use authorization reference.`
    )
  }

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > HARD_MAX_PAGE_SIZE) {
    throw new Error(`ArcGIS page size must be an integer between 1 and ${HARD_MAX_PAGE_SIZE}`)
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > HARD_MAX_PAGES) {
    throw new Error(`ArcGIS maximum pages must be an integer between 1 and ${HARD_MAX_PAGES}`)
  }

  const effectivePageSize = Math.min(pageSize, policy.maxRecordCount)
  const fetchPage = options.fetchPage ?? defaultFetchPage
  const accepted = new Map<string, GravelEvidenceObservation>()
  const stats: OfficialSourceSnapshotStats = {
    pages: 0,
    fetchedFeatures: 0,
    acceptedFeatures: 0,
    rejectedFeatures: 0,
    duplicateFeatures: 0
  }

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const offset = pageIndex * effectivePageSize
    const url = buildArcGisGeoJsonPageUrl(sourceId, offset, effectivePageSize)
    let page: { features: unknown[]; exceededTransferLimit: boolean }
    try {
      page = parseFeatureCollection(await fetchPage(url))
    } catch (error) {
      throw new Error(
        `ArcGIS page for ${sourceId} at offset ${offset} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
    const features = page.features
    stats.pages += 1
    stats.fetchedFeatures += features.length

    for (const feature of features) {
      const observation = normalizeFeature(sourceId, feature)
      if (!observation) {
        stats.rejectedFeatures += 1
        continue
      }

      const previous = accepted.get(observation.sourceFeatureId)
      if (previous) {
        if (serializedObservation(previous) !== serializedObservation(observation)) {
          throw new Error(
            `Source feature ${sourceId}:${observation.sourceFeatureId} changed within one snapshot; conflicting duplicate aborted.`
          )
        }
        stats.duplicateFeatures += 1
        continue
      }
      accepted.set(observation.sourceFeatureId, observation)
    }

    // A short page ends the walk only when ArcGIS does not report more rows:
    // hosts may return fewer rows than requested with exceededTransferLimit.
    // An exact multiple intentionally costs one empty request.
    if (features.length < effectivePageSize && !page.exceededTransferLimit) {
      const observations = sortObservations(accepted.values())
      stats.acceptedFeatures = observations.length
      return {
        sourceId,
        observations,
        fingerprint: officialSourceSnapshotFingerprint(sourceId, observations),
        stats,
        ...(authorizationReference ? { authorizationReference } : {})
      }
    }
  }

  throw new Error(
    `ArcGIS pagination limit reached for ${sourceId} after ${maxPages} full pages; refusing an unbounded or incomplete snapshot.`
  )
}
