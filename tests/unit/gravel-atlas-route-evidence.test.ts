import { describe, expect, it } from "vitest"
import { calculateGravelAtlasRouteEvidence } from "@/lib/roads/gravel-atlas/route-evidence"
import type { GravelAtlasCorridor } from "@/lib/routing/gravel-atlas"

function corridor(id: string, geometry: [number, number][]): GravelAtlasCorridor {
  return {
    id,
    label: id,
    geometry,
    verifiedGravelMeters: 50_000,
    longestContinuousGravelMeters: 50_000,
    fragmentCount: 1,
    confidence: 1,
    verification: "routable",
    sourceIds: [`source-${id}`]
  }
}

describe("Gravel Atlas returned-route evidence", () => {
  it("measures an aligned route that follows a verified corridor", () => {
    const route: [number, number][] = [[-75.4, 40], [-75.3, 40], [-75.2, 40]]
    const evidence = calculateGravelAtlasRouteEvidence(route, [corridor("exact", route)])

    expect(evidence.sharePercent).toBeGreaterThan(99)
    expect(evidence.matchedMeters).toBeGreaterThan(15_000)
    expect(evidence.longestContinuousMeters).toBe(evidence.matchedMeters)
    expect(evidence.matchedCorridorCount).toBe(1)
  })

  it("does not count a nearby parallel road outside the match radius", () => {
    const route: [number, number][] = [[-75.4, 40], [-75.2, 40]]
    const parallel: [number, number][] = [[-75.4, 40.001], [-75.2, 40.001]]
    const evidence = calculateGravelAtlasRouteEvidence(route, [corridor("parallel", parallel)])

    expect(evidence.matchedMeters).toBe(0)
    expect(evidence.sharePercent).toBe(0)
    expect(evidence.matchedCorridorCount).toBe(0)
  })

  it("does not count a same-direction road roughly 30 m beside the verified corridor", () => {
    const route: [number, number][] = [[-75.4, 40], [-75.2, 40]]
    const parallel: [number, number][] = [[-75.4, 40.00027], [-75.2, 40.00027]]
    const evidence = calculateGravelAtlasRouteEvidence(route, [corridor("near-parallel", parallel)])

    expect(evidence.matchedMeters).toBe(0)
    expect(evidence.sharePercent).toBe(0)
    expect(evidence.matchedCorridorCount).toBe(0)
  })

  it("reports partial and longest-contiguous overlap rather than treating any hit as all-gravel", () => {
    const route: [number, number][] = [[-75.4, 40], [-75.3, 40], [-75.2, 40], [-75.1, 40]]
    const gravel: [number, number][] = [[-75.4, 40], [-75.3, 40], [-75.2, 40]]
    const evidence = calculateGravelAtlasRouteEvidence(route, [corridor("partial", gravel)])

    expect(evidence.sharePercent).toBeGreaterThan(60)
    expect(evidence.sharePercent).toBeLessThan(70)
    expect(evidence.longestContinuousMeters).toBe(evidence.matchedMeters)
  })

  it("does not double-count route distance when duplicate corridors overlap", () => {
    const route: [number, number][] = [[-75.4, 40], [-75.2, 40]]
    const evidence = calculateGravelAtlasRouteEvidence(route, [
      corridor("first", route),
      corridor("second", route)
    ])

    expect(evidence.sharePercent).toBeLessThanOrEqual(100)
    expect(evidence.matchedCorridorCount).toBe(2)
  })
})
