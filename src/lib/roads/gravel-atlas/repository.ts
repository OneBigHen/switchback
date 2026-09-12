import { DatabaseSync } from "node:sqlite"
import type { GravelAtlasCorridor } from "@/lib/routing/gravel-atlas"
import type { Coordinate } from "@/lib/routing/types"

export interface GravelAtlasBoundsQuery {
  south: number
  west: number
  north: number
  east: number
  /**
   * Fingerprint of the routing graph/profile configuration used to prove
   * atlas corridors routable. A rebuild changes this fingerprint and stale
   * verification stops contributing candidates until the atlas is rebuilt.
   */
  graphFingerprint: string
  /** Optional expected official-source snapshot build. When supplied, rows
   * from any older/newer snapshot fail closed instead of mixing evidence. */
  sourceFingerprint?: string
  limit: number
}

interface GravelAtlasRow {
  id: string
  label: string
  geometry: string
  verified_gravel_meters: number
  longest_continuous_gravel_meters: number
  fragment_count: number
  confidence: number
  verification_status: string
  source_ids: string
}

const HARD_MAX_QUERY_RESULTS = 200

export interface GravelAtlasBuildMetadata {
  schemaVersion: number
  sourceFingerprint: string
  graphFingerprint: string
  corridorCount: number
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === "number" && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90
}

function parseRow(row: GravelAtlasRow): GravelAtlasCorridor | null {
  try {
    const geometry: unknown = JSON.parse(row.geometry)
    const sourceIds: unknown = JSON.parse(row.source_ids)
    if (!Array.isArray(geometry) || geometry.length < 2 || !geometry.every(isCoordinate)) return null
    if (!Array.isArray(sourceIds) || sourceIds.length === 0 ||
      !sourceIds.every((id) => typeof id === "string" && id.trim().length > 0)) return null
    if (
      typeof row.id !== "string" || row.id.trim().length === 0 ||
      typeof row.label !== "string" || row.label.trim().length === 0 ||
      !Number.isFinite(row.verified_gravel_meters) || row.verified_gravel_meters <= 0 ||
      !Number.isFinite(row.longest_continuous_gravel_meters) || row.longest_continuous_gravel_meters <= 0 ||
      row.longest_continuous_gravel_meters > row.verified_gravel_meters ||
      !Number.isInteger(row.fragment_count) || row.fragment_count < 1 ||
      !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1 ||
      row.verification_status !== "routable"
    ) return null

    return {
      id: row.id,
      label: row.label,
      geometry: geometry as Coordinate[],
      verifiedGravelMeters: row.verified_gravel_meters,
      longestContinuousGravelMeters: row.longest_continuous_gravel_meters,
      fragmentCount: row.fragment_count,
      confidence: row.confidence,
      verification: "routable",
      sourceIds: sourceIds as string[]
    }
  } catch {
    return null
  }
}

/**
 * Read-only runtime view of the prebuilt gravel atlas. Ingestion owns schema
 * creation and verification; route planning only performs bounded spatial
 * reads and fails closed when the database/build fingerprint is unavailable.
 */
export class GravelAtlasRepository {
  constructor(readonly databasePath: string) {}

  /**
   * Build identity of the runtime database. Read before serving the layer so a
   * deployment whose fingerprints do not describe this build fails closed
   * instead of rendering a confirmed-empty viewport.
   */
  readBuildMetadata(): GravelAtlasBuildMetadata {
    const database = new DatabaseSync(this.databasePath, { readOnly: true })
    try {
      const row = database.prepare(`
        select schema_version, source_fingerprint, graph_fingerprint, corridor_count
        from gravel_atlas_metadata
      `).get() as {
        schema_version?: unknown
        source_fingerprint?: unknown
        graph_fingerprint?: unknown
        corridor_count?: unknown
      } | undefined

      if (!row) throw new Error("Gravel Atlas runtime database has no build metadata")
      if (row.schema_version !== 1) throw new Error("Unsupported Gravel Atlas runtime schema version")
      const sourceFingerprint = typeof row.source_fingerprint === "string" ? row.source_fingerprint.trim() : ""
      const graphFingerprint = typeof row.graph_fingerprint === "string" ? row.graph_fingerprint.trim() : ""
      const corridorCount = typeof row.corridor_count === "number" ? row.corridor_count : Number.NaN
      if (
        sourceFingerprint.length === 0 || graphFingerprint.length === 0 ||
        !Number.isInteger(corridorCount) || corridorCount < 0
      ) {
        throw new Error("Gravel Atlas runtime database has invalid build metadata")
      }

      return { schemaVersion: 1, sourceFingerprint, graphFingerprint, corridorCount }
    } finally {
      database.close()
    }
  }

  queryBounds(query: GravelAtlasBoundsQuery): GravelAtlasCorridor[] {
    if (
      !Number.isFinite(query.south) || !Number.isFinite(query.west) ||
      !Number.isFinite(query.north) || !Number.isFinite(query.east) ||
      query.south >= query.north || query.west >= query.east
    ) {
      throw new Error("Use valid gravel atlas bounds")
    }
    if (typeof query.graphFingerprint !== "string" || query.graphFingerprint.trim().length === 0) {
      throw new Error("A routing graph fingerprint is required")
    }
    if (query.sourceFingerprint !== undefined && query.sourceFingerprint.trim().length === 0) {
      throw new Error("A non-empty Gravel Atlas source fingerprint is required when supplied")
    }
    if (!Number.isFinite(query.limit) || query.limit < 1) {
      throw new Error("A positive gravel atlas result limit is required")
    }
    const limit = Math.min(HARD_MAX_QUERY_RESULTS, Math.floor(query.limit))
    const sourceFingerprint = query.sourceFingerprint?.trim() ?? null

    const database = new DatabaseSync(this.databasePath, { readOnly: true })
    try {
      const rows = database.prepare(`
        select
          id, label, geometry, verified_gravel_meters,
          longest_continuous_gravel_meters, fragment_count, confidence,
          verification_status, source_ids
        from gravel_atlas_corridors
        where verification_status = 'routable'
          and graph_fingerprint = ?
          and (? is null or source_fingerprint = ?)
          and east >= ?
          and west <= ?
          and north >= ?
          and south <= ?
        order by confidence desc, longest_continuous_gravel_meters desc, id asc
        limit ?
      `).all(
        query.graphFingerprint.trim(),
        sourceFingerprint,
        sourceFingerprint,
        query.west,
        query.east,
        query.south,
        query.north,
        limit
      ) as unknown as GravelAtlasRow[]

      return rows.flatMap((row) => {
        const corridor = parseRow(row)
        return corridor ? [corridor] : []
      })
    } finally {
      database.close()
    }
  }
}
