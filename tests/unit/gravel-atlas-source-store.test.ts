import { afterEach, describe, expect, it } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { officialSourceSnapshotFingerprint, type OfficialSourceSnapshot } from "@/lib/roads/gravel-atlas/source-snapshot"
import { writeOfficialSourceSnapshots } from "@/lib/roads/gravel-atlas/source-store"
import type { GravelEvidenceObservation } from "@/lib/roads/gravel-atlas/sources"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function observation(overrides: Partial<GravelEvidenceObservation> = {}): GravelEvidenceObservation {
  return {
    sourceId: "njgin-ng911",
    sourceFeatureId: "nj-1",
    region: "NJ",
    geometry: [[-74.8, 40.1], [-74.7, 40.2]],
    roadName: "Test Gravel Road",
    jurisdiction: "Test Township",
    surfaceEvidence: "unimproved",
    accessEvidence: "non-restricted",
    statusEvidence: "active",
    inspected: null,
    sourceUpdatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides
  }
}

function snapshot(observations: GravelEvidenceObservation[]): OfficialSourceSnapshot {
  return {
    sourceId: "njgin-ng911",
    observations,
    fingerprint: officialSourceSnapshotFingerprint("njgin-ng911", observations),
    stats: {
      pages: 1,
      fetchedFeatures: observations.length,
      acceptedFeatures: observations.length,
      rejectedFeatures: 0,
      duplicateFeatures: 0
    }
  }
}

describe("Gravel Atlas official-source staging store", () => {
  it("writes deterministic source metadata, observation provenance, and spatial bounds", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-stage-"))
    directories.push(directory)
    const databasePath = path.join(directory, "sources.sqlite")
    const observations = [observation(), observation({ sourceFeatureId: "nj-2", geometry: [[-75, 39.9], [-74.6, 40.3]] })]

    const result = writeOfficialSourceSnapshots({ databasePath, snapshots: [snapshot(observations)] })

    expect(result.observationCount).toBe(2)
    expect(result.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/)
    const database = new DatabaseSync(databasePath, { readOnly: true })
    const source = database.prepare("select source_id, fingerprint, accepted_count from gravel_source_snapshots").get() as Record<string, unknown>
    const staged = database.prepare("select source_id, source_feature_id, west, south, east, north from gravel_source_observations where source_feature_id = 'nj-2'").get() as Record<string, unknown>
    database.close()

    expect(source).toMatchObject({ source_id: "njgin-ng911", accepted_count: 2 })
    expect(source.fingerprint).toBe(snapshot(observations).fingerprint)
    expect(staged).toMatchObject({
      source_id: "njgin-ng911",
      source_feature_id: "nj-2",
      west: -75,
      south: 39.9,
      east: -74.6,
      north: 40.3
    })
  })

  it("rejects a tampered snapshot without replacing the last good database", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-stage-"))
    directories.push(directory)
    const databasePath = path.join(directory, "sources.sqlite")
    const good = snapshot([observation()])
    const first = writeOfficialSourceSnapshots({ databasePath, snapshots: [good] })
    const before = readFileSync(databasePath)
    const tampered: OfficialSourceSnapshot = { ...good, fingerprint: "0".repeat(64) }

    expect(() => writeOfficialSourceSnapshots({ databasePath, snapshots: [tampered] })).toThrow(/fingerprint/i)
    expect(readFileSync(databasePath)).toEqual(before)
    expect(first.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/)
  })
})
