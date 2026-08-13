import { describe, expect, it } from "vitest"
import { createCanonicalSegment, type CanonicalSegment } from "@/lib/roads/canonical-segments"
import {
  buildRigCorridors,
  buildRigSpatialIndex,
  type RigCorridorSegmentInput
} from "@/lib/roads/rig-corridors"
import type { RigSegmentAggregate } from "@/lib/roads/rig-evidence"

const buildOptions = {
  sourceBuild: "rig-test-build",
  builtAt: "2026-08-11T12:00:00.000Z",
  minimumSegmentUtility: 0.6,
  minimumEvidenceStrength: 0.5,
  minimumContiguousMeters: 150
}

async function segment(
  way: string,
  from: string,
  to: string,
  coordinates: [[number, number], [number, number]]
): Promise<CanonicalSegment> {
  return createCanonicalSegment({
    osmWayId: way,
    fromOsmNodeId: from,
    toOsmNodeId: to,
    direction: "forward",
    osmSnapshot: "2026-08-01",
    topologyVersion: "topology-1",
    geometry: coordinates
  })
}

function aggregate(segmentUid: string, value: number, overrides: Partial<RigSegmentAggregate> = {}): RigSegmentAggregate {
  return {
    segmentUid,
    dominantRole: "highlight",
    dimensions: { gravelInterest: value, scenicProxy: value },
    totalEvidenceWeight: value,
    evidenceConfidence: value,
    evidenceStrength: value,
    independentSourceCount: 2,
    maxContributorWeight: 1,
    accessConfidence: 0,
    surfaceConfidence: value,
    hardAuthorityWeight: 0,
    softCurrentReportWeight: 0,
    preference: { alpha: 1, beta: 1, mean: 0.5 },
    observationCount: 1,
    ...overrides
  }
}

async function pair(): Promise<[CanonicalSegment, CanonicalSegment]> {
  return Promise.all([
    segment("10", "1", "2", [[0, 0], [0.001, 0]]),
    segment("11", "2", "3", [[0.001, 0], [0.002, 0]])
  ])
}

describe("RIG corridor clusters", () => {
  it("keeps a contiguous high-value run and excludes a disconnected snippet", async () => {
    const [first, second] = await pair()
    const disconnected = await segment("12", "4", "5", [[1, 1], [1.001, 1]])
    const inputs: RigCorridorSegmentInput[] = [
      { segment: first, aggregate: aggregate(first.segmentUid, 0.8) },
      { segment: second, aggregate: aggregate(second.segmentUid, 0.8) },
      { segment: disconnected, aggregate: aggregate(disconnected.segmentUid, 0.95) }
    ]

    const corridors = buildRigCorridors(inputs, buildOptions)

    expect(corridors).toHaveLength(1)
    expect(corridors[0]).toMatchObject({
      segmentUids: [first.segmentUid, second.segmentUid],
      entryNodeId: "1",
      exitNodeId: "3",
      provenance: { sourceBuild: "rig-test-build", builtAt: buildOptions.builtAt }
    })
    expect(corridors[0]!.lengthMeters).toBeGreaterThan(200)
    expect(corridors[0]!.expectedUtility).toBeCloseTo(0.8, 2)
    expect(corridors[0]).not.toHaveProperty("geometry")
  })

  it("does not bridge a material ride-character break or guess a nearby topology", async () => {
    const [first, second] = await pair()
    const nearbyButDifferent = await segment("13", "20", "21", [[0.0011, 0], [0.0021, 0]])
    const inputs: RigCorridorSegmentInput[] = [
      { segment: first, aggregate: aggregate(first.segmentUid, 0.9) },
      { segment: second, aggregate: aggregate(second.segmentUid, 0.1) },
      { segment: nearbyButDifferent, aggregate: aggregate(nearbyButDifferent.segmentUid, 0.9) }
    ]

    const corridors = buildRigCorridors(inputs, {
      ...buildOptions,
      minimumContiguousMeters: 0,
      maximumCharacterDistance: 0.2,
      connectionRadiusMeters: 2
    })

    expect(corridors).toHaveLength(2)
    expect(corridors.every((corridor) => corridor.segmentUids.length === 1)).toBe(true)
  })
})

describe("RIG spatial index", () => {
  it("indexes segment UIDs into bounded tiles without copying geometry", async () => {
    const [first, second] = await pair()
    const index = buildRigSpatialIndex([first, second], {
      sourceBuild: "rig-test-build",
      builtAt: buildOptions.builtAt,
      zoom: 12,
      maxSegments: 10
    })

    expect(index.tiles.length).toBeGreaterThan(0)
    expect(index.tiles.flatMap((tile) => tile.segmentUids)).toEqual(expect.arrayContaining([first.segmentUid, second.segmentUid]))
    expect(index).not.toHaveProperty("segments")
    expect(index.tiles.every((tile) => tile.segmentUids.length <= 10)).toBe(true)
  })

  it("rejects invalid or oversized graph inputs at the build boundary", async () => {
    const [first] = await pair()
    expect(() => buildRigSpatialIndex([first], { sourceBuild: "", maxSegments: 10 })).toThrow(/source build/i)
    expect(() => buildRigSpatialIndex([first, first], { sourceBuild: "build", maxSegments: 1 })).toThrow(/maximum/i)
    expect(() => buildRigCorridors([
      { segment: first, aggregate: aggregate("b".repeat(64), 0.9) }
    ], buildOptions)).toThrow(/aggregate/i)
  })
})
