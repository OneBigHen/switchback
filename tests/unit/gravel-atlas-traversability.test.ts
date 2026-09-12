import { describe, expect, it } from "vitest"
import {
  DEFAULT_TRAVERSABILITY_THRESHOLDS,
  evaluateCorridorTraversability
} from "@/lib/roads/gravel-atlas/traversability"

describe("Gravel Atlas corridor traversability", () => {
  it("accepts a corridor the built graph can ride end to end", () => {
    const verdict = evaluateCorridorTraversability(5109, {
      endpointSnapMeters: [3, 2],
      routeMeters: 5150,
      corridorCoveredByRoute: 1
    })

    expect(verdict.traversable).toBe(true)
    expect(verdict.metrics.detourRatio).toBe(1.008)
  })

  it("refuses a corridor GraphHopper cannot route", () => {
    const verdict = evaluateCorridorTraversability(700, {
      endpointSnapMeters: [4, 4],
      routeMeters: null,
      corridorCoveredByRoute: null
    })

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("no-route")
  })

  it("refuses a corridor whose endpoint is not on the routable network", () => {
    const verdict = evaluateCorridorTraversability(1200, {
      endpointSnapMeters: [null, 5],
      routeMeters: 1210,
      corridorCoveredByRoute: 1
    })

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("no-route")
  })

  it("refuses a corridor whose endpoint snaps beyond the network tolerance", () => {
    const verdict = evaluateCorridorTraversability(2000, {
      endpointSnapMeters: [12, 61],
      routeMeters: 2050,
      corridorCoveredByRoute: 1
    })

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("endpoint-off-network")
  })

  it("allows an endpoint snap exactly at the tolerance", () => {
    const verdict = evaluateCorridorTraversability(2000, {
      endpointSnapMeters: [60, 12],
      routeMeters: 2050,
      corridorCoveredByRoute: 1
    })

    expect(verdict.traversable).toBe(true)
  })

  it("refuses a corridor the returned route only partly follows", () => {
    const verdict = evaluateCorridorTraversability(702, {
      endpointSnapMeters: [6, 1],
      routeMeters: 3597,
      corridorCoveredByRoute: 0.1667
    })

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("route-diverges")
    expect(verdict.metrics.detourRatio).toBe(5.124)
  })

  it("allows coverage exactly at the minimum", () => {
    const verdict = evaluateCorridorTraversability(248, {
      endpointSnapMeters: [2, 2],
      routeMeters: 250,
      corridorCoveredByRoute: 0.6
    })

    expect(verdict.traversable).toBe(true)
  })

  it("refuses a degenerate zero-length route", () => {
    const verdict = evaluateCorridorTraversability(248, {
      endpointSnapMeters: [2, 2],
      routeMeters: 0,
      corridorCoveredByRoute: 1
    })

    expect(verdict.traversable).toBe(false)
    if (verdict.traversable) throw new Error("unreachable")
    expect(verdict.reason).toBe("no-route")
  })

  it("refuses a corridor with no measurable length", () => {
    const verdict = evaluateCorridorTraversability(0, {
      endpointSnapMeters: [1, 1],
      routeMeters: 10,
      corridorCoveredByRoute: 1
    })

    expect(verdict.traversable).toBe(false)
  })

  it("publishes the thresholds it enforces", () => {
    expect(DEFAULT_TRAVERSABILITY_THRESHOLDS).toEqual({
      matchRadiusMeters: 40,
      maxEndpointSnapMeters: 60,
      minCoveredFraction: 0.6
    })
  })
})
