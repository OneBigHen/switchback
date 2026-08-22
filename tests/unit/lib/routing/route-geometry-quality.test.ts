import { describe, expect, it } from "vitest"
import { backtrackingShare, selfOverlapShare } from "@/lib/routing/route-geometry-quality"

describe("backtracking and self-overlap", () => {
  it("measures immediate backtracking share", () => {
    const straight: [number, number][] = [
      [-76.9, 40.2],
      [-76.8, 40.2],
      [-76.7, 40.2]
    ]
    expect(backtrackingShare(straight)).toBeLessThan(0.05)

    // A long dead-end spur: north 11 km, then immediately back south.
    const spur: [number, number][] = [
      [-76.9, 40.2],
      [-76.88, 40.2],
      [-76.87, 40.3],
      [-76.88, 40.2],
      [-76.86, 40.2]
    ]
    expect(backtrackingShare(spur)).toBeGreaterThan(0.3)
  })

  it("measures self-overlap via revisited grid cells", () => {
    const loop: [number, number][] = [
      [-76.8867, 40.2732],
      [-76.7000, 40.3200], [-76.6800, 40.3000], [-76.7000, 40.3200],
      [-76.6600, 40.3000], [-76.6400, 40.2800], [-76.6600, 40.3000],
      [-76.6200, 40.2800], [-76.6000, 40.2600], [-76.6200, 40.2800],
      [-76.5800, 40.2600], [-76.5600, 40.2400], [-76.5800, 40.2600],
      [-76.5400, 40.2400], [-76.5200, 40.2200], [-76.5400, 40.2400],
      [-76.5000, 40.2200], [-76.4800, 40.2000], [-76.5000, 40.2200],
      [-76.4600, 40.2000], [-76.4400, 40.1800], [-76.4600, 40.2000],
      [-76.4200, 40.1800], [-76.4000, 40.1600], [-76.4200, 40.1800],
      [-76.3055, 40.0379]
    ]
    expect(selfOverlapShare(loop)).toBeGreaterThan(0.2)
    expect(selfOverlapShare([[-76.9, 40.2], [-76.6, 40.3]])).toBe(0)
  })
})
