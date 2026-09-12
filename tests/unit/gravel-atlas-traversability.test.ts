import { describe, expect, it } from "vitest"
import {
  DEFAULT_TRAVERSABILITY_THRESHOLDS,
  evaluateCorridorTraversability
} from "@/lib/roads/gravel-atlas/traversability"

type Probe = Parameters<typeof evaluateCorridorTraversability>[1]

function probe(overrides: Record<string, unknown> = {}): Probe {
  return {
    endpointSnapMeters: [2, 2],
    routeMeters: 1000,
    corridorCoveredByRoute: 1,
    longestContinuousCoveredFraction: 1,
    directionAgreementFraction: 1,
    ...overrides
  } as unknown as Probe
}

describe("Gravel Atlas corridor traversability", () => {
  it("accepts a corridor the built graph can ride end to end", () => {
    const verdict = evaluateCorridorTraversability(5109, probe({
      endpointSnapMeters: [3, 2],
      routeMeters: 5150
    }))

    expect(verdict.traversable).toBe(true)
    expect(verdict.metrics.detourRatio).toBe(1.008)
  })

  it("refuses a corridor GraphHopper cannot route", () => {
    const verdict = evaluateCorridorTraversability(700, probe({
      endpointSnapMeters: [4, 4],
      routeMeters: null,
      corridorCoveredByRoute: null,
      longestContinuousCoveredFraction: null,
      directionAgreementFraction: null
    }))

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("no-route")
  })

  it("refuses a corridor whose endpoint is not on the routable network", () => {
    const verdict = evaluateCorridorTraversability(1200, probe({
      endpointSnapMeters: [null, 5],
      routeMeters: 1210
    }))

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("no-route")
  })

  it("refuses a corridor whose endpoint snaps beyond the network tolerance", () => {
    const verdict = evaluateCorridorTraversability(2000, probe({
      endpointSnapMeters: [12, 61],
      routeMeters: 2050
    }))

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("endpoint-off-network")
  })

  it("allows an endpoint snap exactly at the tolerance", () => {
    const verdict = evaluateCorridorTraversability(2000, probe({
      endpointSnapMeters: [60, 12],
      routeMeters: 2050
    }))

    expect(verdict.traversable).toBe(true)
  })

  it("refuses a corridor the returned route only partly follows", () => {
    const verdict = evaluateCorridorTraversability(702, probe({
      endpointSnapMeters: [6, 1],
      routeMeters: 3597,
      corridorCoveredByRoute: 0.1667,
      longestContinuousCoveredFraction: 0.1667
    }))

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("route-diverges")
    expect(verdict.metrics.detourRatio).toBe(5.124)
  })

  it("refuses a route that only covers 79% of the corridor", () => {
    const verdict = evaluateCorridorTraversability(1000, probe({
      routeMeters: 1050,
      corridorCoveredByRoute: 0.79,
      longestContinuousCoveredFraction: 0.79
    }))

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("route-diverges")
  })

  it("allows coverage exactly at the hardened minimum", () => {
    const verdict = evaluateCorridorTraversability(1000, probe({
      routeMeters: 1050,
      corridorCoveredByRoute: 0.8,
      longestContinuousCoveredFraction: 0.8
    }))

    expect(verdict.traversable).toBe(true)
  })

  it("refuses scattered proximity hits without a long continuous traversal", () => {
    const verdict = evaluateCorridorTraversability(1000, probe({
      routeMeters: 1050,
      corridorCoveredByRoute: 0.95,
      longestContinuousCoveredFraction: 0.4
    }))

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("route-diverges")
  })

  it("refuses nearby geometry whose direction does not agree with the corridor", () => {
    const verdict = evaluateCorridorTraversability(1000, probe({
      routeMeters: 1050,
      corridorCoveredByRoute: 0.95,
      longestContinuousCoveredFraction: 0.95,
      directionAgreementFraction: 0.5
    }))

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("route-diverges")
  })

  it("refuses a route whose detour proves it does not traverse the corridor directly", () => {
    const verdict = evaluateCorridorTraversability(1000, probe({
      routeMeters: 1501,
      corridorCoveredByRoute: 1,
      longestContinuousCoveredFraction: 1,
      directionAgreementFraction: 1
    }))

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("route-diverges")
  })

  it("refuses a degenerate zero-length route", () => {
    const verdict = evaluateCorridorTraversability(248, probe({ routeMeters: 0 }))

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("no-route")
  })

  it("refuses a corridor with no measurable length", () => {
    const verdict = evaluateCorridorTraversability(0, probe({ routeMeters: 10 }))

    expect(verdict.traversable).toBe(false)
  })

  it("publishes the thresholds it enforces", () => {
    expect(DEFAULT_TRAVERSABILITY_THRESHOLDS).toEqual({
      matchRadiusMeters: 20,
      maxEndpointSnapMeters: 60,
      minCoveredFraction: 0.8,
      minContinuousCoveredFraction: 0.6,
      minDirectionAgreementFraction: 0.85,
      maxDetourRatio: 1.5
    })
  })
})
