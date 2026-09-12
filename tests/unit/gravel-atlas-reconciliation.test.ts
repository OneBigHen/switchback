import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createCanonicalSegment } from "@/lib/roads/canonical-segments"
import { officialSourceSnapshotFingerprint, type OfficialSourceSnapshot } from "@/lib/roads/gravel-atlas/source-snapshot"
import { writeOfficialSourceSnapshots } from "@/lib/roads/gravel-atlas/source-store"
import { reconcileGravelAtlasSources } from "@/lib/roads/gravel-atlas/reconciliation"
import type { GravelEvidenceObservation } from "@/lib/roads/gravel-atlas/sources"

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function snapshot(observations: GravelEvidenceObservation[]): OfficialSourceSnapshot {
  return {
    sourceId: "njgin-ng911",
    observations,
    fingerprint: officialSourceSnapshotFingerprint("njgin-ng911", observations),
    stats: { pages: 1, fetchedFeatures: observations.length, acceptedFeatures: observations.length, rejectedFeatures: 0, duplicateFeatures: 0 }
  }
}

describe("Gravel Atlas canonical graph reconciliation", () => {
  it("turns an official source line that follows the active graph into a routable corridor", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-reconcile-"))
    directories.push(directory)
    const source: GravelEvidenceObservation = {
      sourceId: "njgin-ng911",
      sourceFeatureId: "road-1",
      region: "NJ",
      geometry: [[-74.8, 40.1], [-74.79, 40.1], [-74.78, 40.1]],
      roadName: "Pine Road",
      surfaceEvidence: "unimproved",
      accessEvidence: "non-restricted",
      statusEvidence: "active",
      inspected: null
    }
    const staged = writeOfficialSourceSnapshots({
      databasePath: path.join(directory, "sources.sqlite"),
      snapshots: [snapshot([source])]
    })
    const segment = await createCanonicalSegment({
      osmWayId: "100",
      fromOsmNodeId: "1",
      toOsmNodeId: "2",
      direction: "forward",
      osmSnapshot: "2026-09-11",
      topologyVersion: "graph-v1",
      geometry: [[-74.8, 40.10002], [-74.79, 40.10002], [-74.78, 40.10002]]
    })

    const result = await reconcileGravelAtlasSources({
      stagingDatabasePath: staged.databasePath,
      graphFingerprint: "graph-v1",
      routableSegments: [segment]
    })

    expect(result.sourceFingerprint).toBe(staged.sourceFingerprint)
    expect(result.corridors).toHaveLength(1)
    expect(result.corridors[0]).toMatchObject({
      id: "njgin-ng911:road-1",
      label: "Pine Road",
      verification: "routable",
      canonicalSegmentIds: [segment.segmentUid],
      sourceFeatureRefs: [{ sourceId: "njgin-ng911", sourceFeatureId: "road-1" }]
    })
    expect(result.corridors[0]!.verifiedGravelMeters).toBeGreaterThan(500)
    expect(result.quarantined).toEqual([])
  })

  it("quarantines official evidence that cannot be proven against the active routable graph", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-gravel-reconcile-"))
    directories.push(directory)
    const source: GravelEvidenceObservation = {
      sourceId: "njgin-ng911",
      sourceFeatureId: "road-off-graph",
      region: "NJ",
      geometry: [[-74.3, 40.5], [-74.29, 40.5]],
      surfaceEvidence: "unimproved",
      accessEvidence: "non-restricted",
      statusEvidence: "active",
      inspected: null
    }
    const staged = writeOfficialSourceSnapshots({
      databasePath: path.join(directory, "sources.sqlite"),
      snapshots: [snapshot([source])]
    })
    const segment = await createCanonicalSegment({
      osmWayId: "100",
      fromOsmNodeId: "1",
      toOsmNodeId: "2",
      direction: "forward",
      osmSnapshot: "2026-09-11",
      topologyVersion: "graph-v1",
      geometry: [[-74.8, 40.1], [-74.79, 40.1]]
    })

    const result = await reconcileGravelAtlasSources({
      stagingDatabasePath: staged.databasePath,
      graphFingerprint: "graph-v1",
      routableSegments: [segment]
    })

    expect(result.corridors).toEqual([])
    expect(result.quarantined).toEqual([
      expect.objectContaining({ sourceId: "njgin-ng911", sourceFeatureId: "road-off-graph", reason: "no-routable-graph-match" })
    ])
  })
})
