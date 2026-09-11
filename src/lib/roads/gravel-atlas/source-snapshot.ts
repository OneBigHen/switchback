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
}

export interface CollectOfficialSourceSnapshotOptions {
  fetchPage?: ArcGisPageFetcher
  pageSize?: number
  maxPages?: number
  /**
   * Explicit operator acknowledgement for a source whose metadata restricts
   * reproduction/redistribution. This is not a grant of permission or license.
   */
  acceptRestrictedSource?: boolean
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

function parseFeatureCollection(value: unknown): unknown[] {
  const payload = record(value)
  if (!payload || payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    const serviceMessage = record(payload?.error)?.message
    throw new Error(
      typeof serviceMessage === "string" && serviceMessage.trim()
        ? `ArcGIS service error: ${serviceMessage.trim()}`
        : "ArcGIS source returned an invalid FeatureCollection payload"
    )
  }
  return payload.features
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

async function defaultFetchPage(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/geo+json, application/json" }
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
  if (policy.redistribution === "permission-required" && options.acceptRestrictedSource !== true) {
    throw new Error(
      `${policy.label} has restricted reproduction/redistribution terms; explicitly acknowledge the source terms before fetching it.`
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
    const offset = pageIndex * pageSize
    const url = buildArcGisGeoJsonPageUrl(sourceId, offset, pageSize)
    const features = parseFeatureCollection(await fetchPage(url))
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

    // A short page proves the deterministic offset walk reached the end. An
    // exact multiple intentionally costs one empty request, which avoids
    // trusting service-specific transfer-limit flags that vary by ArcGIS host.
    if (features.length < pageSize) {
      const observations = sortObservations(accepted.values())
      stats.acceptedFeatures = observations.length
      return {
        sourceId,
        observations,
        fingerprint: officialSourceSnapshotFingerprint(sourceId, observations),
        stats
      }
    }
  }

  throw new Error(
    `ArcGIS pagination limit reached for ${sourceId} after ${maxPages} full pages; refusing an unbounded or incomplete snapshot.`
  )
}
