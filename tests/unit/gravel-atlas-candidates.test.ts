import { describe, expect, it } from "vitest"
import { buildAnchorSets, type CorridorEnvelope } from "@/lib/routing/destination-corridors"
import { generateCorridorCandidates } from "@/lib/routing/candidate-generator"
import type { GravelAtlasCorridor } from "@/lib/routing/gravel-atlas"
import { normalizeRouteRequest, type NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { Coordinate, GravelAtlasIntensity } from "@/lib/routing/types"

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

function atlasSources(
  corridors: GravelAtlasCorridor[],
  intensity: GravelAtlasIntensity = "maximum",
  enabled = true
) {
  return {
    preference: { enabled, intensity },
    corridors
  }
}

function request(): NormalizedRouteRequest {
  return normalizeRouteRequest({
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
    candidateSet: "primary",
    gravelAtlas: { enabled: true, intensity: "balanced" }
  })
}

describe("PA Gravel Atlas candidate integration", () => {
  it("creates an explicit gravel-atlas anchor set whose anchors stay on verified source geometry", () => {
    const atlas = atlasCorridor()
    const sets = buildAnchorSets(start, finish, envelope, {
      curvatureSegments: [],
      gpxRoutes: [],
      hints: [],
      gravelAtlas: atlasSources([atlas])
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
      gravelAtlas: atlasSources([atlasCorridor({ verification: "unverified" })])
    })

    expect(sets).toEqual([])
  })

  it("cannot inject atlas candidates when the rider preference is disabled", () => {
    const sets = buildAnchorSets(start, finish, envelope, {
      curvatureSegments: [],
      gpxRoutes: [],
      hints: [],
      gravelAtlas: atlasSources([atlasCorridor()], "maximum", false)
    })

    expect(sets).toEqual([])
  })

  it.each([
    ["balanced", 1],
    ["more", 2],
    ["maximum", 3]
  ] as const)("bounds %s atlas exploration to %i corridor candidates", (intensity, expected) => {
    const corridors = [
      atlasCorridor({
        id: "west",
        geometry: [[-75.19, 40.205], [-75.18, 40.205]],
        sourceIds: ["pa-atlas:west"]
      }),
      atlasCorridor({
        id: "center",
        geometry: [[-75.12, 40.22], [-75.11, 40.22]],
        sourceIds: ["pa-atlas:center"]
      }),
      atlasCorridor({
        id: "east",
        geometry: [[-75.04, 40.205], [-75.03, 40.205]],
        sourceIds: ["pa-atlas:east"]
      })
    ]

    const sets = buildAnchorSets(start, finish, envelope, {
      curvatureSegments: [],
      gpxRoutes: [],
      hints: [],
      gravelAtlas: atlasSources(corridors, intensity)
    })

    expect(sets).toHaveLength(expected)
    expect(sets.every((set) => set.source === "gravel-atlas")).toBe(true)
  })

  it("preserves gravel-atlas provenance when an anchor set becomes a routing candidate", () => {
    const [set] = buildAnchorSets(start, finish, envelope, {
      curvatureSegments: [],
      gpxRoutes: [],
      hints: [],
      gravelAtlas: atlasSources([atlasCorridor()])
    })
    expect(set).toBeDefined()

    const [candidate] = generateCorridorCandidates(request(), [set!])

    expect(candidate?.source).toBe("gravel-atlas")
    expect(candidate?.id).toBe("corridor-gravel-atlas-bucks-gravel-1")
    expect(candidate?.request.points.length).toBeGreaterThan(2)
    expect(candidate?.request.gravelAtlas.enabled).toBe(true)
  })
})
