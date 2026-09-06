import { describe, expect, it } from "vitest"
import type { Coordinate, RouteInstruction } from "@/lib/routing/types"
import {
  classifyPaRouteRegion,
  extractRouteRoadNames,
  rideRegionMatches
} from "@/lib/rides/route-library-intelligence"

function route(...coordinates: Coordinate[]): Coordinate[] {
  return coordinates
}

describe("route library geographic intelligence", () => {
  it.each([
    ["NE", route([-75.70, 41.30], [-75.55, 41.45])],
    ["NW", route([-80.18, 41.90], [-79.95, 42.10])],
    ["SE", route([-75.40, 40.00], [-75.10, 40.20])],
    ["SW", route([-80.20, 40.25], [-79.80, 40.55])]
  ] as const)("classifies a route from its actual geometry as %s PA", (expected, geometry) => {
    const summary = classifyPaRouteRegion(geometry)
    expect(summary.primary).toBe(expected.toLowerCase())
    expect(summary.label).toBe(`${expected} PA`)
    expect(summary.crossRegion).toBe(false)
  })

  it("distance-weights route segments and exposes meaningful cross-region membership", () => {
    const geometry = route(
      [-80.10, 40.45],
      [-79.90, 40.45],
      [-77.60, 40.45],
      [-75.45, 40.05],
      [-75.15, 40.05]
    )

    const summary = classifyPaRouteRegion(geometry)
    expect(summary.crossRegion).toBe(true)
    expect(summary.regions).toContain("sw")
    expect(summary.regions).toContain("se")
    expect(rideRegionMatches(summary, "cross")).toBe(true)
    expect(rideRegionMatches(summary, "sw")).toBe(true)
    expect(rideRegionMatches(summary, "se")).toBe(true)
  })

  it("does not let duplicate or densely sampled GPS points distort region share", () => {
    const sparse = route([-80.05, 40.45], [-77.60, 40.45], [-75.20, 40.05])
    const denseStart = route(
      ...Array.from({ length: 80 }, (_, index): Coordinate => [-80.05 + index * 0.00001, 40.45]),
      [-77.60, 40.45],
      [-75.20, 40.05]
    )

    const sparseSummary = classifyPaRouteRegion(sparse)
    const denseSummary = classifyPaRouteRegion(denseStart)
    expect(denseSummary.primary).toBe(sparseSummary.primary)
    expect(denseSummary.crossRegion).toBe(sparseSummary.crossRegion)
    expect(denseSummary.shares.se ?? 0).toBeCloseTo(sparseSummary.shares.se ?? 0, 1)
    expect(denseSummary.shares.sw ?? 0).toBeCloseTo(sparseSummary.shares.sw ?? 0, 1)
  })

  it("keeps clearly non-Pennsylvania routes out of PA quadrant filters", () => {
    const summary = classifyPaRouteRegion(route([-74.10, 40.65], [-73.95, 40.80]))
    expect(summary.primary).toBeNull()
    expect(summary.label).toBe("Outside PA")
    expect(rideRegionMatches(summary, "se")).toBe(false)
  })

  it("extracts real road names from provider instructions without inventing labels", () => {
    const instructions = [
      { streetName: "PA-32" },
      { streetName: "River Road" },
      { streetName: "PA-32" },
      { streetName: "" },
      { streetName: "  Dark Hollow Road  " }
    ] as RouteInstruction[]

    expect(extractRouteRoadNames(instructions)).toEqual([
      "PA-32",
      "River Road",
      "Dark Hollow Road"
    ])
  })
})
