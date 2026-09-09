import { describe, expect, it } from "vitest"
import { workingStateLine } from "@/lib/advice/working-state"
import type { PlannedRoute } from "@/lib/routing/types"

function route(overrides: Partial<PlannedRoute> & { id: string }): PlannedRoute {
  return {
    name: overrides.id,
    profile: "balanced",
    distanceMiles: 100,
    durationMinutes: 180,
    twistiness: 40,
    turnCount: 100,
    roadMix: {},
    surfaceMix: {},
    ...overrides
  } as PlannedRoute
}

// `calculateDetailDistribution` stores route mixes as percentages (0..100),
// not fractions. Keep these fixtures production-realistic so the working-state
// formatter cannot accidentally multiply an already-percent value again.
const best = route({
  id: "best-ride", name: "Best Ride", durationMinutes: 210, twistiness: 79,
  surfaceMix: { unpaved: 38 } as never
})
const fastest = route({
  id: "fastest-now", name: "Fastest", durationMinutes: 185, twistiness: 22,
  surfaceMix: { unpaved: 7 } as never
})

describe("deterministic advisor working state", () => {
  it("names the actual trade being weighed, from local data only", () => {
    const line = workingStateLine({ routes: [best, fastest], selectedRouteId: "best-ride" })
    // Every number here was computed by Switchback before the model was asked.
    expect(line).toBe("Weighing +25 min, +31% unpaved and +57 curve score…")
  })

  it("uses a provider surface percentage once rather than multiplying it twice", () => {
    const selected = route({
      id: "selected",
      durationMinutes: 180,
      twistiness: 100,
      surfaceMix: { unpaved: 2.4 } as never
    })

    const line = workingStateLine({ routes: [selected], selectedRouteId: "selected" })

    expect(line).toBe("Weighing 2% unpaved against a 100/100 curve score…")
    expect(line).not.toContain("240%")
  })

  it("falls back to the selected surface percentage when a delta rounds to zero", () => {
    const selected = route({
      id: "selected",
      durationMinutes: 200,
      twistiness: 80,
      surfaceMix: { unpaved: 2.4 } as never
    })
    const fastest = route({
      id: "fastest",
      durationMinutes: 180,
      twistiness: 20,
      surfaceMix: { unpaved: 2.1 } as never
    })

    const line = workingStateLine({ routes: [selected, fastest], selectedRouteId: "selected" })

    expect(line).toBe("Weighing +20 min, 2% unpaved and +60 curve score…")
    expect(line).not.toContain("+0%")
  })

  it.each([
    [101, "101%"],
    [-1, "-1%"],
    [Number.NaN, "NaN"],
    [Number.POSITIVE_INFINITY, "Infinity"]
  ])("suppresses an invalid selected unpaved source: %s", (unpaved, rendered) => {
    const selected = route({
      id: "selected",
      durationMinutes: 200,
      surfaceMix: { unpaved } as never
    })
    const fastest = route({ id: "fastest", durationMinutes: 180 })

    const line = workingStateLine({ routes: [selected, fastest], selectedRouteId: "selected" }) ?? ""

    expect(line).not.toContain(rendered)
    expect(line).not.toMatch(/(?:NaN|Infinity)/)
  })

  it("suppresses an invalid fastest unpaved source instead of clamping or comparing it", () => {
    const selected = route({
      id: "selected",
      durationMinutes: 200,
      surfaceMix: { unpaved: 12 } as never
    })
    const fastest = route({
      id: "fastest",
      durationMinutes: 180,
      surfaceMix: { unpaved: 101 } as never
    })

    const line = workingStateLine({ routes: [selected, fastest], selectedRouteId: "selected" })

    expect(line).toBe("Weighing +20 min against 12% unpaved…")
    expect(line).not.toContain("+12% unpaved")
    expect(line).not.toContain("101%")
    expect(line).not.toContain("-89%")
  })

  it("says something true about the fastest route when it is the one selected", () => {
    const line = workingStateLine({ routes: [best, fastest], selectedRouteId: "fastest-now" })
    // No added minutes to weigh against, so it must not invent a "+0 min".
    expect(line).not.toContain("+0 min")
    expect(line).toContain("unpaved")
  })

  it("returns null rather than inventing a fact when there is nothing to say", () => {
    const flat = route({ id: "only", durationMinutes: 100, twistiness: 0 })
    expect(workingStateLine({ routes: [flat], selectedRouteId: "only" })).toBeNull()
    expect(workingStateLine({ routes: [best], selectedRouteId: "missing" })).toBeNull()
    expect(workingStateLine({ routes: [], selectedRouteId: "best-ride" })).toBeNull()
  })

  it("never predicts a verdict", () => {
    const line = workingStateLine({ routes: [best, fastest], selectedRouteId: "best-ride" }) ?? ""
    // The line describes the comparison, never its outcome — the model has not
    // answered yet, and a preview would be an unvalidated claim.
    for (const verdict of ["worth", "recommend", "better", "take the", "should"]) {
      expect(line.toLowerCase()).not.toContain(verdict)
    }
  })

  it("tolerates a missing surface mix without producing NaN", () => {
    const noSurface = route({ id: "a", durationMinutes: 200, twistiness: 50 })
    const other = route({ id: "b", durationMinutes: 180, twistiness: 20 })
    const line = workingStateLine({ routes: [noSurface, other], selectedRouteId: "a" }) ?? ""
    expect(line).not.toContain("NaN")
    expect(line).toContain("+20 min")
  })
})
