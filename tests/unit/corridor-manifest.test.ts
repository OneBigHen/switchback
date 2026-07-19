import { describe, expect, it } from "vitest"
import {
  CORRIDOR_MANIFEST_SCHEMA_VERSION,
  buildCorridorManifest,
  type CorridorManifestSettings
} from "@/lib/offline/corridor-manifest"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"

const baseSettings: CorridorManifestSettings = {
  corridorWidthMeters: 250,
  maxGraphSegments: 4,
  maxEstimatedBytes: 100_000,
  sampleSpacingMeters: 250
}

const baseGeometry: Coordinate[] = [
  [-77, 40],
  [-76.9, 40.05],
  [-76.8, 40.1],
  [-76.7, 40.08],
  [-76.6, 40]
]

const baseRoute: PlannedRoute = {
  id: "r1",
  name: "Test Loop",
  profile: "twisty",
  geometry: baseGeometry,
  waypoints: [],
  instructions: [],
  distanceMiles: 12,
  durationMinutes: 30,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 50,
  turnCount: 4,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

const fixedDate = new Date("2024-01-01T00:00:00.000Z")

describe("corridor-manifest builder", () => {
  it("builds a manifest from a simple two-point route with a single corridor segment", () => {
    const result = buildCorridorManifest(
      { ...baseRoute, geometry: [[-77, 40], [-76.9, 40.05]] },
      { ...baseSettings, maxGraphSegments: 4 },
      fixedDate
    )
    expect(result.manifest).not.toBeNull()
    expect(result.error).toBeNull()
    const manifest = result.manifest!
    expect(manifest.schemaVersion).toBe(CORRIDOR_MANIFEST_SCHEMA_VERSION)
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.segments).toHaveLength(1)
    expect(manifest.truncated).toBe(false)
    expect(manifest.estimatedBytes).toBeGreaterThan(0)
    expect(manifest.estimatedBytes).toBeLessThanOrEqual(
      baseSettings.maxEstimatedBytes
    )
  })

  it("partitions a multi-point route into multiple segments up to maxGraphSegments", () => {
    const tenPointGeometry: Coordinate[] = Array.from({ length: 10 }, (_, i) => [
      -77 + i * 0.01,
      40 + i * 0.005
    ])
    const result = buildCorridorManifest(
      { ...baseRoute, geometry: tenPointGeometry },
      { ...baseSettings, maxGraphSegments: 3 },
      fixedDate
    )
    expect(result.manifest).not.toBeNull()
    const manifest = result.manifest!
    expect(manifest.segments).toHaveLength(3)
    // totalEdges = 9, segmentCount = 3, edgesPerSegment = 3, remainder = 0
    // sourceEdgeIndex should be 0, 3, 6
    expect(manifest.segments[0].sourceEdgeIndex).toBe(0)
    expect(manifest.segments[1].sourceEdgeIndex).toBe(3)
    expect(manifest.segments[2].sourceEdgeIndex).toBe(6)
    for (const segment of manifest.segments) {
      expect(segment.halfWidthMeters).toBe(baseSettings.corridorWidthMeters)
    }
  })

  it("includes first and last route coordinates in the centerline", () => {
    const result = buildCorridorManifest(baseRoute, baseSettings, fixedDate)
    expect(result.manifest).not.toBeNull()
    const manifest = result.manifest!
    expect(manifest.centerline[0]).toEqual(baseRoute.geometry[0])
    expect(manifest.centerline.at(-1)).toEqual(baseRoute.geometry.at(-1))
  })

  it("rejects preview-only route with invalid_route", () => {
    const result = buildCorridorManifest(
      { ...baseRoute, previewOnly: true },
      baseSettings,
      fixedDate
    )
    expect(result.manifest).toBeNull()
    expect(result.error?.kind).toBe("invalid_route")
  })

  it("rejects zero or negative width with invalid_width", () => {
    const zero = buildCorridorManifest(
      baseRoute,
      { ...baseSettings, corridorWidthMeters: 0 },
      fixedDate
    )
    expect(zero.manifest).toBeNull()
    expect(zero.error?.kind).toBe("invalid_width")

    const negative = buildCorridorManifest(
      baseRoute,
      { ...baseSettings, corridorWidthMeters: -10 },
      fixedDate
    )
    expect(negative.manifest).toBeNull()
    expect(negative.error?.kind).toBe("invalid_width")
  })

  it("rejects route with < 2 coordinates with invalid_route", () => {
    const result = buildCorridorManifest(
      { ...baseRoute, geometry: [[-77, 40]] as Coordinate[] },
      baseSettings,
      fixedDate
    )
    expect(result.manifest).toBeNull()
    expect(result.error?.kind).toBe("invalid_route")
  })

  it("rejects route with malformed coordinate (NaN longitude) with invalid_geometry", () => {
    const malformed: Coordinate[] = [
      [Number.NaN, 40],
      [-76.9, 40.05]
    ]
    const result = buildCorridorManifest(
      { ...baseRoute, geometry: malformed },
      baseSettings,
      fixedDate
    )
    expect(result.manifest).toBeNull()
    expect(result.error?.kind).toBe("invalid_geometry")
  })

  it("rejects malformed geometry (single-element coordinate) with invalid_geometry", () => {
    const malformed = [
      [-77, 40],
      [-76.9],
      [-76.8, 40]
    ] as unknown as Coordinate[]
    const result = buildCorridorManifest(
      { ...baseRoute, geometry: malformed },
      baseSettings,
      fixedDate
    )
    expect(result.manifest).toBeNull()
    expect(result.error?.kind).toBe("invalid_geometry")
  })

  it("rejects budget-exceeding routes with budget_exceeded when truncation cannot fit", () => {
    // 60-point route where any single corridor segment already produces a
    // serialized payload well over the minimum allowed budget (1024 bytes).
    const longGeometry: Coordinate[] = Array.from({ length: 60 }, (_, i) => [
      -77 + i * 0.01,
      40
    ])
    const result = buildCorridorManifest(
      { ...baseRoute, geometry: longGeometry },
      { ...baseSettings, maxEstimatedBytes: 1024, maxGraphSegments: 4 },
      fixedDate
    )
    expect(result.manifest).toBeNull()
    expect(result.error?.kind).toBe("budget_exceeded")
  })

  it("computes correct geographic bounds from centerline", () => {
    const square: Coordinate[] = [
      [-77, 40],
      [-77, 41],
      [-76, 41],
      [-76, 40],
      [-77, 40]
    ]
    const result = buildCorridorManifest(
      { ...baseRoute, geometry: square },
      baseSettings,
      fixedDate
    )
    expect(result.manifest).not.toBeNull()
    const bounds = result.manifest!.bounds
    expect(bounds.minLon).toBeCloseTo(-77, 6)
    expect(bounds.maxLon).toBeCloseTo(-76, 6)
    expect(bounds.minLat).toBeCloseTo(40, 6)
    expect(bounds.maxLat).toBeCloseTo(41, 6)
  })
})
