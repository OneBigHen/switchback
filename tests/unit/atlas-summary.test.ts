import { describe, expect, it } from "vitest"
import { summariseAtlas, type AtlasSummaryRoute } from "@/lib/gpx/atlas-summary"

function route(overrides: Partial<AtlasSummaryRoute> & { id: string }): AtlasSummaryRoute {
  return {
    name: `Route ${overrides.id}`,
    distanceMiles: 100,
    durationMinutes: 120,
    twistiness: 70,
    turnCount: 400,
    sourceProject: "rideplanner",
    ...overrides
  }
}

const counts = { importedVariants: 10, foldedVariants: 3 }

describe("summariseAtlas", () => {
  it("keeps merged-collection and empty imports out of the headline totals", () => {
    const summary = summariseAtlas([
      route({ id: "a", distanceMiles: 100, durationMinutes: 120, turnCount: 400 }),
      route({ id: "oversized", distanceMiles: 10_663, durationMinutes: 15_981, turnCount: 7_813 }),
      route({ id: "empty", distanceMiles: 0, durationMinutes: 0, turnCount: 0 })
    ], counts)

    expect(summary.posters).toBe(3)
    expect(summary.oversized).toBe(1)
    expect(summary.empty).toBe(1)
    // Without the exclusion a single merged file would carry 99% of the mileage.
    expect(summary.totalMiles).toBe(100)
    expect(summary.totalHours).toBe(2)
    expect(summary.totalTurns).toBe(400)
  })

  it("reports band shares against the rideable routes only", () => {
    const summary = summariseAtlas([
      route({ id: "calm", twistiness: 5 }),
      route({ id: "hairpin-1", twistiness: 90 }),
      route({ id: "hairpin-2", twistiness: 80 }),
      route({ id: "excluded", twistiness: 90, distanceMiles: 5_000 })
    ], counts)

    const bands = Object.fromEntries(summary.bands.map((slice) => [slice.band, slice]))
    expect(bands.calm?.count).toBe(1)
    expect(bands.hairpin?.count).toBe(2)
    expect(bands.hairpin?.share).toBeCloseTo(2 / 3)
    expect(summary.bands.map((slice) => slice.band)).toEqual(["calm", "mellow", "twisty", "hairpin"])
  })

  it("gives each standout award to a different route", () => {
    // One route tops every ranking; the other awards must fall through to the
    // next best rather than naming the same ride three times.
    const summary = summariseAtlas([
      route({ id: "dominant", distanceMiles: 300, turnCount: 900, twistiness: 100 }),
      route({ id: "second", distanceMiles: 200, turnCount: 800, twistiness: 90 }),
      route({ id: "third", distanceMiles: 100, turnCount: 700, twistiness: 80 })
    ], counts)

    expect(summary.longest?.id).toBe("dominant")
    expect(summary.mostTurns?.id).toBe("second")
    expect(summary.twistiest?.id).toBe("third")
  })

  it("bins route lengths and ranks source projects by count", () => {
    const summary = summariseAtlas([
      route({ id: "a", distanceMiles: 10, sourceProject: "LongWay" }),
      route({ id: "b", distanceMiles: 60, sourceProject: "rideplanner" }),
      route({ id: "c", distanceMiles: 150, sourceProject: "rideplanner" }),
      route({ id: "d", distanceMiles: 450, sourceProject: "rideplanner" })
    ], counts)

    expect(summary.lengths.map((bin) => bin.count)).toEqual([1, 0, 1, 1, 0, 1])
    expect(summary.sources.map((slice) => slice.project)).toEqual(["rideplanner", "LongWay"])
    expect(summary.sources[0]?.count).toBe(3)
    expect(summary.medianMiles).toBe(105)
  })

  it("survives an empty collection without dividing by zero", () => {
    const summary = summariseAtlas([], { importedVariants: 0, foldedVariants: 0 })

    expect(summary.posters).toBe(0)
    expect(summary.medianMiles).toBe(0)
    expect(summary.longest).toBeNull()
    expect(summary.bands.every((slice) => slice.share === 0)).toBe(true)
  })
})
