import { describe, expect, it } from "vitest"
import { buildAnchorSets, type CorridorEnvelope } from "@/lib/routing/destination-corridors"
import { generateCorridorCandidates } from "@/lib/routing/candidate-generator"
import type { GravelAtlasCorridor } from "@/lib/routing/gravel-atlas"
import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { Coordinate } from "@/lib/routing/types"

const start: Coordinate = [-75.20, 40.20]
const finish: Coordinate = [-75.00, 40.20]
const envelope: CorridorEnvelope = {
  maxPathDistanceMiles: 30,
  maxLateralMiles: 10
}

function atlasCorridor(overrides: Partial<GravelAtlasCorridor> = {}): GravelAtlasCorridor {
  return {
    id: "bucks-gravel-1",
    label: "Bucks gravel run",
    geometry: [
      [-75.16, 40.21],
      [-75.12, 40.22],
      [-75.08, 40.21]
    ],
    verifiedGravelMeters: 8_000,
    longestContinuousGravelMeters: 7_500,
    fragmentCount: 1,
    confidence: 0.95,
    verification: "routable",
    sourceIds: ["pa-atlas:1"],
    ...overrides
  }
}

function request(): NormalizedRouteRequest {
  return {
    profile: "gravel",
    points: [
      { lat: start[1], lon: start[0], label: "Start" },
      { lat: finish[1], lon: finish[0], label: "Finish" }
    ],
    requestId: "atlas-test",
    source: "manual",
    avoidHighways: false,
    avoidAreas: [],
    segmentProfiles: [],
    tollPolicy: "allow-with-warning",
    roadLocks: [],
    planningId: "atlas-plan",
    candidateSet: "primary"
  }
}

describe("PA Gravel Atlas candidate integration", () => {
  it("creates an explicit gravel-atlas anchor set whose anchors stay on verified source geometry", () => {
    const atlas = atlasCorridor()
    const sets = buildAnchorSets(start, finish, envelope, {
      curvatureSegments: [],
      gpxRoutes: [],
      hints: [],
      gravelAtlasCorridors: [atlas]
    })

    expect(sets).toHaveLength(1)
    expect(sets[0]?.source).toBe("gravel-atlas")
    expect(sets[0]?.id).toBe("gravel-atlas-bucks-gravel-1")
    expect(sets[0]?.anchors.length).toBeGreaterThan(0)
    for (const anchor of sets[0]?.anchors ?? []) {
      expect(atlas.geometry).toContainEqual(anchor)
    }
  })

  it("does not turn an unverified atlas line into a shaping candidate", () => {
    const sets = buildAnchorSets(start, finish, envelope, {
      curvatureSegments: [],
      gpxRoutes: [],
      hints: [],
      gravelAtlasCorridors: [atlasCorridor({ verification: "unverified" })]
    })

    expect(sets).toEqual([])
  })

  it("preserves gravel-atlas provenance when an anchor set becomes a routing candidate", () => {
    const [set] = buildAnchorSets(start, finish, envelope, {
      curvatureSegments: [],
      gpxRoutes: [],
      hints: [],
      gravelAtlasCorridors: [atlasCorridor()]
    })
    expect(set).toBeDefined()

    const [candidate] = generateCorridorCandidates(request(), [set!])

    expect(candidate?.source).toBe("gravel-atlas")
    expect(candidate?.id).toBe("corridor-gravel-atlas-bucks-gravel-1")
    expect(candidate?.request.points.length).toBeGreaterThan(2)
  })
})
