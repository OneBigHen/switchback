import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { officialSourceSnapshotFingerprint, type OfficialSourceSnapshot } from "@/lib/roads/gravel-atlas/source-snapshot"
import { writeOfficialSourceSnapshots } from "@/lib/roads/gravel-atlas/source-store"
import { buildGravelAtlasRuntimeDatabase, parseVerifiedRuntimeInput } from "@/lib/roads/gravel-atlas/runtime-builder"
import { GravelAtlasRepository } from "@/lib/roads/gravel-atlas/repository"
import type { GravelEvidenceObservation } from "@/lib/roads/gravel-atlas/sources"
import { GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION } from "@/lib/roads/gravel-atlas/traversability"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function stage(directory: string) {
  const observation: GravelEvidenceObservation = {
    sourceId: "njgin-ng911",
    sourceFeatureId: "nj-1",
    region: "NJ",
    geometry: [[-74.8, 40.1], [-74.7, 40.2]],
    roadName: "Test Gravel Road",
    jurisdiction: "Test Township",
    surfaceEvidence: "unimproved",
    accessEvidence: "non-restricted",
    statusEvidence: "active",
    inspected: null
  }
  const snapshot: OfficialSourceSnapshot = {
    sourceId: "njgin-ng911",
    observations: [observation],
    fingerprint: officialSourceSnapshotFingerprint("njgin-ng911", [observation]),
    stats: { pages: 1, fetchedFeatures: 1, acceptedFeatures: 1, rejectedFeatures: 0, duplicateFeatures: 0 }
  }
  return writeOfficialSourceSnapshots({
    databasePath: path.join(directory, "sources.sqlite"),
    snapshots: [snapshot]
  })
}

function corridor() {
  return {
    id: "nj-test-1",
    label: "Test Gravel Road",
    geometry: [[-74.8, 40.1], [-74.75, 40.15], [-74.7, 40.2]] as [number, number][],
    verifiedGravelMeters: 9_000,
    longestContinuousGravelMeters: 8_500,
    fragmentCount: 1,
    confidence: 0.94,
    verification: "routable" as const,
    canonicalSegmentIds: ["segment-uid-1"],
    sourceFeatureRefs: [{ sourceId: "njgin-ng911" as const, sourceFeatureId: "nj-1" }]
  }
}

describe("Gravel Atlas runtime database builder", () => {
  it("writes graph-verified corridors tied to the staged source fingerprint and policy", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-runtime-"))
    directories.push(directory)
    const staged = stage(directory)
    const databasePath = path.join(directory, "gravel-atlas.sqlite")

    const built = buildGravelAtlasRuntimeDatabase({
      stagingDatabasePath: staged.databasePath,
      databasePath,
      graphFingerprint: "graph-v1",
      traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
      corridors: [corridor()]
    })

    expect(built.sourceFingerprint).toBe(staged.sourceFingerprint)
    expect(built.graphFingerprint).toBe("graph-v1")
    expect(built.traversabilityPolicyVersion).toBe(GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION)
    expect(built.corridorCount).toBe(1)
    const rows = new GravelAtlasRepository(databasePath).queryBounds({
      south: 39.9,
      west: -75,
      north: 40.4,
      east: -74.5,
      graphFingerprint: "graph-v1",
      sourceFingerprint: staged.sourceFingerprint,
      limit: 10
    })
    expect(rows.map((row) => row.id)).toEqual(["nj-test-1"])
  })

  it("refuses to publish verified corridors against a staging snapshot with a different source fingerprint", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-runtime-"))
    directories.push(directory)
    const staged = stage(directory)
    expect(() => buildGravelAtlasRuntimeDatabase({
      stagingDatabasePath: staged.databasePath,
      databasePath: path.join(directory, "gravel-atlas.sqlite"),
      graphFingerprint: "graph-v1",
      expectedSourceFingerprint: "e".repeat(64),
      traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
      corridors: [corridor()]
    })).toThrow(/source fingerprint/i)
  })

  it("requires the verified payload to carry the graph and source fingerprints it was verified against", () => {
    const payload = { graphFingerprint: "g", sourceFingerprint: "s".repeat(64), traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION, corridors: [] }
    expect(parseVerifiedRuntimeInput(payload)).toMatchObject({ graphFingerprint: "g", sourceFingerprint: "s".repeat(64) })
    expect(() => parseVerifiedRuntimeInput({ ...payload, sourceFingerprint: undefined })).toThrow(/sourceFingerprint/)
    expect(() => parseVerifiedRuntimeInput({ ...payload, traversabilityPolicyVersion: 1 })).toThrow(/policy/)
  })

  it("fails closed for a stale source fingerprint", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-runtime-"))
    directories.push(directory)
    const staged = stage(directory)
    const databasePath = path.join(directory, "gravel-atlas.sqlite")
    buildGravelAtlasRuntimeDatabase({
      stagingDatabasePath: staged.databasePath,
      databasePath,
      graphFingerprint: "graph-v1",
      traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
      corridors: [corridor()]
    })

    expect(() => new GravelAtlasRepository(databasePath).queryBounds({
      south: 39.9,
      west: -75,
      north: 40.4,
      east: -74.5,
      graphFingerprint: "graph-v1",
      sourceFingerprint: "f".repeat(64),
      limit: 10
    })).toThrow(/source fingerprint/i)
  })

  it("rejects unknown source references without replacing the last good runtime database", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-runtime-"))
    directories.push(directory)
    const staged = stage(directory)
    const databasePath = path.join(directory, "gravel-atlas.sqlite")
    buildGravelAtlasRuntimeDatabase({
      stagingDatabasePath: staged.databasePath,
      databasePath,
      graphFingerprint: "graph-v1",
      traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
      corridors: [corridor()]
    })
    const before = readFileSync(databasePath)

    expect(() => buildGravelAtlasRuntimeDatabase({
      stagingDatabasePath: staged.databasePath,
      databasePath,
      graphFingerprint: "graph-v2",
      traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION,
      corridors: [{
        ...corridor(),
        sourceFeatureRefs: [{ sourceId: "njgin-ng911", sourceFeatureId: "missing" }]
      }]
    })).toThrow(/source feature/i)
    expect(readFileSync(databasePath)).toEqual(before)
  })

  it("rejects a runtime build produced under a stale traversability policy", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-runtime-"))
    directories.push(directory)
    const staged = stage(directory)
    const databasePath = path.join(directory, "gravel-atlas.sqlite")

    expect(() => buildGravelAtlasRuntimeDatabase({
      stagingDatabasePath: staged.databasePath,
      databasePath,
      graphFingerprint: "graph-v1",
      traversabilityPolicyVersion: GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION - 1,
      corridors: [corridor()]
    })).toThrow(/traversability policy/i)
  })
})
