import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { GravelAtlasRepository } from "@/lib/roads/gravel-atlas/repository"
import { GRAVEL_ATLAS_RUNTIME_SCHEMA_VERSION } from "@/lib/roads/gravel-atlas/runtime-builder"
import { GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION } from "@/lib/roads/gravel-atlas/traversability"

let directory = ""
let databasePath = ""

interface AtlasTestRow {
  id: string
  label: string
  geometry: string
  verified_gravel_meters: number
  longest_continuous_gravel_meters: number
  fragment_count: number
  confidence: number
  verification_status: string
  source_ids: string
  source_fingerprint: string
  graph_fingerprint: string
  west: number
  south: number
  east: number
  north: number
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-atlas-"))
  databasePath = path.join(directory, "atlas.sqlite")
  const database = new DatabaseSync(databasePath)
  database.exec(`
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
      source_fingerprint text not null,
      graph_fingerprint text not null,
      west real not null,
      south real not null,
      east real not null,
      north real not null
    );
    create index idx_gravel_atlas_bounds on gravel_atlas_corridors(west, east, south, north);
  `)
  database.prepare(`
    insert into gravel_atlas_metadata (
      schema_version, source_fingerprint, graph_fingerprint,
      traversability_policy_version, corridor_count
    ) values (?, ?, ?, ?, ?)
  `).run(
    GRAVEL_ATLAS_RUNTIME_SCHEMA_VERSION,
    "source-v1",
    "graph-v1",
    GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
    1
  )
  database.close()
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

function insert(overrides: Partial<AtlasTestRow> = {}) {
  const database = new DatabaseSync(databasePath)
  const row: AtlasTestRow = {
    id: "bucks-1",
    label: "Bucks gravel",
    geometry: JSON.stringify([[-75.2, 40.2], [-75.1, 40.25], [-75.0, 40.3]]),
    verified_gravel_meters: 9000,
    longest_continuous_gravel_meters: 8500,
    fragment_count: 1,
    confidence: 0.95,
    verification_status: "routable",
    source_ids: JSON.stringify(["pa-gpx:1"]),
    source_fingerprint: "source-v1",
    graph_fingerprint: "graph-v1",
    west: -75.2,
    south: 40.2,
    east: -75.0,
    north: 40.3,
    ...overrides
  }
  database.prepare(`
    insert into gravel_atlas_corridors (
      id, label, geometry, verified_gravel_meters,
      longest_continuous_gravel_meters, fragment_count, confidence,
      verification_status, source_ids, source_fingerprint, graph_fingerprint,
      west, south, east, north
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.label, row.geometry, row.verified_gravel_meters,
    row.longest_continuous_gravel_meters, row.fragment_count, row.confidence,
    row.verification_status, row.source_ids, row.source_fingerprint, row.graph_fingerprint,
    row.west, row.south, row.east, row.north
  )
  database.close()
}

function updateMetadata(overrides: {
  schemaVersion?: number
  sourceFingerprint?: string
  graphFingerprint?: string
  traversabilityPolicyVersion?: number
}): void {
  const database = new DatabaseSync(databasePath)
  database.prepare(`
    update gravel_atlas_metadata set
      schema_version = ?, source_fingerprint = ?, graph_fingerprint = ?,
      traversability_policy_version = ?
  `).run(
    overrides.schemaVersion ?? GRAVEL_ATLAS_RUNTIME_SCHEMA_VERSION,
    overrides.sourceFingerprint ?? "source-v1",
    overrides.graphFingerprint ?? "graph-v1",
    overrides.traversabilityPolicyVersion ?? GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION
  )
  database.close()
}

const bounds = { south: 40.0, west: -75.4, north: 40.5, east: -74.8 }

describe("GravelAtlasRepository", () => {
  it("returns only graph-routable corridors verified against the active graph fingerprint", () => {
    insert()
    insert({ id: "stale", graph_fingerprint: "graph-old", source_ids: JSON.stringify(["pa-gpx:2"]) })
    insert({ id: "unverified", verification_status: "unverified", source_ids: JSON.stringify(["pa-gpx:3"]) })

    const result = new GravelAtlasRepository(databasePath).queryBounds({
      ...bounds,
      graphFingerprint: "graph-v1",
      sourceFingerprint: "source-v1",
      limit: 10
    })

    expect(result.map((corridor) => corridor.id)).toEqual(["bucks-1"])
  })

  it("uses bbox intersection so statewide data outside the planning envelope is not loaded", () => {
    insert()
    insert({
      id: "erie",
      geometry: JSON.stringify([[-80.2, 42.0], [-80.0, 42.1]]),
      source_ids: JSON.stringify(["pa-gpx:erie"]),
      west: -80.2,
      south: 42.0,
      east: -80.0,
      north: 42.1
    })

    const result = new GravelAtlasRepository(databasePath).queryBounds({
      ...bounds,
      graphFingerprint: "graph-v1",
      sourceFingerprint: "source-v1",
      limit: 10
    })

    expect(result.map((corridor) => corridor.id)).toEqual(["bucks-1"])
  })

  it("drops malformed stored geometry/provenance instead of poisoning route planning", () => {
    insert({ id: "bad-geometry", geometry: "not-json", source_ids: JSON.stringify(["pa-gpx:bad"]) })
    insert({ id: "bad-source", source_ids: "[]" })

    const result = new GravelAtlasRepository(databasePath).queryBounds({
      ...bounds,
      graphFingerprint: "graph-v1",
      sourceFingerprint: "source-v1",
      limit: 10
    })

    expect(result).toEqual([])
  })

  it("bounds runtime result count", () => {
    for (let index = 0; index < 20; index += 1) {
      insert({
        id: `road-${index}`,
        source_ids: JSON.stringify([`pa-gpx:${index}`]),
        confidence: 1 - index / 100
      })
    }

    const result = new GravelAtlasRepository(databasePath).queryBounds({
      ...bounds,
      graphFingerprint: "graph-v1",
      sourceFingerprint: "source-v1",
      limit: 5
    })

    expect(result).toHaveLength(5)
    expect(result[0]?.id).toBe("road-0")
  })

  it("rejects matching corridor rows when runtime metadata names a different graph", () => {
    insert()
    updateMetadata({ graphFingerprint: "graph-old" })

    expect(() => new GravelAtlasRepository(databasePath).queryBounds({
      ...bounds,
      graphFingerprint: "graph-v1",
      sourceFingerprint: "source-v1",
      limit: 10
    })).toThrow(/graph fingerprint/i)
  })

  it("rejects matching corridor rows when runtime metadata uses a stale verifier policy", () => {
    insert()
    updateMetadata({ traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION - 1 })

    expect(() => new GravelAtlasRepository(databasePath).queryBounds({
      ...bounds,
      graphFingerprint: "graph-v1",
      sourceFingerprint: "source-v1",
      limit: 10
    })).toThrow(/traversability policy/i)
  })
})
