import { describe, expect, it } from "vitest"

import {
  buildCanonicalSegmentGraph,
  canonicalSegmentUid,
  createCanonicalSegment,
  planCanonicalSegmentMigration,
  validateCanonicalSegment,
  verifyCanonicalSegment,
  type CanonicalSegmentInput
} from "@/lib/roads/canonical-segments"

const baseInput: CanonicalSegmentInput = {
  osmSnapshot: "osm-2026-08-11",
  topologyVersion: "topology-v1",
  osmWayId: "123",
  fromOsmNodeId: "456",
  toOsmNodeId: "789",
  direction: "forward",
  geometry: [[-76, 40], [-75.99, 40]]
}

async function segment(overrides: Partial<CanonicalSegmentInput> = {}) {
  return createCanonicalSegment({ ...baseInput, ...overrides })
}

describe("canonical segment identity", () => {
  it("hashes the OSM way, endpoints, and direction exactly", async () => {
    await expect(canonicalSegmentUid({
      osmWayId: "123",
      fromOsmNodeId: "456",
      toOsmNodeId: "789",
      direction: "forward"
    })).resolves.toBe("fcea9c4fc13daed2243aa7c8cb2cc6bb26aac8cd936c9c9a1120f804f5187383")

    await expect(canonicalSegmentUid({
      osmWayId: "123",
      fromOsmNodeId: "789",
      toOsmNodeId: "456",
      direction: "reverse"
    })).resolves.not.toBe("fcea9c4fc13daed2243aa7c8cb2cc6bb26aac8cd936c9c9a1120f804f5187383")
  })

  it("stores the geometry hash and derived length without trusting provider edge ids", async () => {
    const created = await segment()
    expect(created).toMatchObject({
      osmWayId: "123",
      fromOsmNodeId: "456",
      toOsmNodeId: "789",
      direction: "forward",
      topologyVersion: "topology-v1"
    })
    expect(created.segmentUid).toHaveLength(64)
    expect(created.geometryHash).toHaveLength(64)
    expect(created.lengthMeters).toBeGreaterThan(0)
    expect(created).not.toHaveProperty("edgeId")
    expect(validateCanonicalSegment(created)).toBe(true)
    await expect(verifyCanonicalSegment(created)).resolves.toBe(true)
  })

  it("rejects tampered hashes and duplicate identities at the graph boundary", async () => {
    const first = await segment()
    const tampered = { ...first, geometryHash: "0".repeat(64) }
    expect(validateCanonicalSegment(tampered)).toBe(true)
    await expect(verifyCanonicalSegment(tampered)).resolves.toBe(false)
    await expect(buildCanonicalSegmentGraph([tampered])).rejects.toThrow(/hash-mismatched/i)
    await expect(planCanonicalSegmentMigration([tampered], [first], {
      sourceBuild: "build-old",
      targetBuild: "build-new"
    })).rejects.toThrow(/hash-mismatched/i)
    await expect(buildCanonicalSegmentGraph([first, first])).rejects.toThrow(/duplicate canonical segment/i)
  })
})

describe("canonical segment migration", () => {
  it("keeps exact OSM identity and records a same-way geometry migration", async () => {
    const oldSegment = await segment({ osmSnapshot: "osm-old", topologyVersion: "topology-old" })
    const exact = await segment({ osmSnapshot: "osm-new", topologyVersion: "topology-new" })
    const sameWay = await segment({
      osmSnapshot: "osm-new",
      topologyVersion: "topology-new",
      toOsmNodeId: "999",
      geometry: [[-76, 40], [-75.995, 40], [-75.99, 40]]
    })

    const exactPlan = await planCanonicalSegmentMigration([oldSegment], [exact], {
      sourceBuild: "build-old",
      targetBuild: "build-new"
    })
    expect(exactPlan.quarantined).toEqual([])
    expect(exactPlan.lineage).toMatchObject([{
      oldSegmentUid: oldSegment.segmentUid,
      newSegmentUid: exact.segmentUid,
      kind: "exact",
      directionMatch: true,
      migrationConfidence: 1,
      sourceBuild: "build-old",
      targetBuild: "build-new"
    }])

    const sameWayPlan = await planCanonicalSegmentMigration([oldSegment], [sameWay], {
      sourceBuild: "build-old",
      targetBuild: "build-new"
    })
    expect(sameWayPlan.quarantined).toEqual([])
    expect(sameWayPlan.lineage[0]).toMatchObject({
      kind: "same-way-overlap",
      directionMatch: true,
      oldSegmentUid: oldSegment.segmentUid,
      newSegmentUid: sameWay.segmentUid
    })
    expect(sameWayPlan.lineage[0]!.overlapRatio).toBeGreaterThan(0.9)
  })

  it("uses directional spatial overlap but rejects a reversed candidate", async () => {
    const oldSegment = await segment({ osmWayId: "100" })
    const spatial = await segment({ osmWayId: "200", osmSnapshot: "osm-new", topologyVersion: "topology-new" })
    const reversed = await segment({
      osmWayId: "300",
      osmSnapshot: "osm-new",
      topologyVersion: "topology-new",
      fromOsmNodeId: "789",
      toOsmNodeId: "456",
      direction: "forward",
      geometry: [...baseInput.geometry].reverse() as CanonicalSegmentInput["geometry"]
    })

    const plan = await planCanonicalSegmentMigration([oldSegment], [spatial, reversed], {
      sourceBuild: "build-old",
      targetBuild: "build-new"
    })
    expect(plan.lineage).toHaveLength(1)
    expect(plan.lineage[0]).toMatchObject({ kind: "spatial-overlap", newSegmentUid: spatial.segmentUid, directionMatch: true })
    expect(plan.quarantined).toEqual([])
  })

  it("records one-to-many lineage for a split and quarantines ambiguous spatial matches", async () => {
    const oldSegment = await segment({
      osmWayId: "500",
      geometry: [[-76, 40], [-75.98, 40]]
    })
    const splitA = await segment({
      osmWayId: "500",
      fromOsmNodeId: "456",
      toOsmNodeId: "800",
      osmSnapshot: "osm-new",
      topologyVersion: "topology-new",
      geometry: [[-76, 40], [-75.99, 40]]
    })
    const splitB = await segment({
      osmWayId: "500",
      fromOsmNodeId: "800",
      toOsmNodeId: "789",
      osmSnapshot: "osm-new",
      topologyVersion: "topology-new",
      geometry: [[-75.99, 40], [-75.98, 40]]
    })
    const splitPlan = await planCanonicalSegmentMigration([oldSegment], [splitA, splitB], {
      sourceBuild: "build-old",
      targetBuild: "build-new"
    })
    expect(splitPlan.quarantined).toEqual([])
    expect(splitPlan.lineage).toHaveLength(2)
    expect(splitPlan.lineage.every((row) => row.kind === "one-to-many")).toBe(true)

    const ambiguousOld = await segment({ osmWayId: "900" })
    const ambiguousA = await segment({ osmWayId: "901", osmSnapshot: "osm-new", topologyVersion: "topology-new" })
    const ambiguousB = await segment({ osmWayId: "902", osmSnapshot: "osm-new", topologyVersion: "topology-new" })
    const ambiguousPlan = await planCanonicalSegmentMigration([ambiguousOld], [ambiguousA, ambiguousB], {
      sourceBuild: "build-old",
      targetBuild: "build-new"
    })
    expect(ambiguousPlan.lineage).toEqual([])
    expect(ambiguousPlan.quarantined).toMatchObject([{
      oldSegmentUid: ambiguousOld.segmentUid,
      candidateNewSegmentUids: [ambiguousA.segmentUid, ambiguousB.segmentUid]
    }])
  })

  it("records many-to-one lineage for a same-way merge", async () => {
    const oldA = await segment({
      osmWayId: "700",
      fromOsmNodeId: "456",
      toOsmNodeId: "800",
      geometry: [[-76, 40], [-75.99, 40]],
      osmSnapshot: "osm-old",
      topologyVersion: "topology-old"
    })
    const oldB = await segment({
      osmWayId: "700",
      fromOsmNodeId: "800",
      toOsmNodeId: "789",
      geometry: [[-75.99, 40], [-75.98, 40]],
      osmSnapshot: "osm-old",
      topologyVersion: "topology-old"
    })
    const merged = await segment({
      osmWayId: "700",
      geometry: [[-76, 40], [-75.99, 40], [-75.98, 40]],
      osmSnapshot: "osm-new",
      topologyVersion: "topology-new"
    })

    const plan = await planCanonicalSegmentMigration([oldA, oldB], [merged], {
      sourceBuild: "build-old",
      targetBuild: "build-new"
    })
    expect(plan.quarantined).toEqual([])
    expect(plan.lineage).toHaveLength(2)
    expect(plan.lineage.every((row) => row.kind === "many-to-one")).toBe(true)
    expect(new Set(plan.lineage.map((row) => row.newSegmentUid))).toEqual(new Set([merged.segmentUid]))
  })
})
