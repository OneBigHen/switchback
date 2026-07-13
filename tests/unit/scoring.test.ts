import { describe, expect, it } from "vitest"
import {
  analyzeGeometry,
  calculateDetailDistribution,
  calculateGeometryOverlap
} from "@/lib/routing/scoring"

const straight: [number, number][] = [
  [-76.9, 40.2],
  [-76.8, 40.2],
  [-76.7, 40.2],
  [-76.6, 40.2]
]

const switchbacks: [number, number][] = [
  [-76.9, 40.2],
  [-76.88, 40.22],
  [-76.86, 40.2],
  [-76.84, 40.22],
  [-76.82, 40.2],
  [-76.8, 40.22],
  [-76.78, 40.2]
]

describe("route scoring", () => {
  it("scores repeated direction changes above a straight road", () => {
    const direct = analyzeGeometry(straight)
    const curvy = analyzeGeometry(switchbacks)

    expect(direct.twistiness).toBeLessThan(20)
    expect(curvy.twistiness).toBeGreaterThan(60)
    expect(curvy.turnCount).toBeGreaterThan(direct.turnCount)
  })

  it("does not inflate twistiness when the same geometry has extra collinear points", () => {
    const sparse = analyzeGeometry(switchbacks)
    const dense: [number, number][] = switchbacks.flatMap((point, index) => {
      const next = switchbacks[index + 1]
      if (!next) return [point]
      return [
        point,
        [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] as [number, number]
      ]
    })

    expect(Math.abs(analyzeGeometry(dense).twistiness - sparse.twistiness)).toBeLessThanOrEqual(3)
  })

  it("weights road details by traveled distance rather than interval count", () => {
    const coordinates: [number, number][] = [
      [-76.9, 40.2],
      [-76.8, 40.2],
      [-76.799, 40.2],
      [-76.798, 40.2],
      [-76.797, 40.2]
    ]
    const distribution = calculateDetailDistribution(coordinates, [
      [0, 1, "primary"],
      [1, 2, "residential"],
      [2, 3, "residential"],
      [3, 4, "residential"]
    ])

    expect(distribution.primary).toBeGreaterThan(95)
    expect(distribution.residential).toBeLessThan(5)
  })

  it("reports route overlap from geometry rather than labels", () => {
    expect(calculateGeometryOverlap(straight, straight)).toBe(100)
    expect(
      calculateGeometryOverlap(straight, straight.map(([lon, lat]) => [lon, lat + 1]))
    ).toBe(0)
  })
})
