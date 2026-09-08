import { describe, expect, it } from "vitest"
import {
  clamp01,
  finiteNumber,
  normalizePoints,
  projectGeographicPoints
} from "@/components/graphics/graphics-math"

describe("graphics math", () => {
  it("keeps zero coordinates and discards non-finite points", () => {
    const result = normalizePoints(
      [
        [0, 0],
        [-75.2, 40.1],
        [Number.NaN, 40.2],
        [-75.1, Number.POSITIVE_INFINITY]
      ],
      { width: 100, height: 72, padding: 6 }
    )

    expect(result).toHaveLength(2)
    expect(result.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })

  it("centers a degenerate axis without division by zero", () => {
    const result = normalizePoints(
      [[-75, 40], [-75, 41], [-75, 42]],
      { width: 100, height: 72, padding: 6 }
    )

    expect(new Set(result.map((point) => point.x)).size).toBe(1)
    expect(result[0]?.x).toBe(50)
    expect(result.every((point) => Number.isFinite(point.y))).toBe(true)
  })

  it("preserves aspect ratio inside the padded drawing box", () => {
    const result = normalizePoints(
      [[0, 0], [10, 5]],
      { width: 100, height: 72, padding: 6 }
    )

    const xs = result.map((point) => point.x)
    const ys = result.map((point) => point.y)
    const width = Math.max(...xs) - Math.min(...xs)
    const height = Math.max(...ys) - Math.min(...ys)

    expect(width / height).toBeCloseTo(2, 5)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(6)
    expect(Math.max(...xs)).toBeLessThanOrEqual(94)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(6)
    expect(Math.max(...ys)).toBeLessThanOrEqual(66)
  })

  it("clamps finite preference values and rejects non-finite values", () => {
    expect(clamp01(-2)).toBe(0)
    expect(clamp01(0.4)).toBe(0.4)
    expect(clamp01(5)).toBe(1)
    expect(clamp01(Number.NaN)).toBeNull()
    expect(finiteNumber(0)).toBe(0)
    expect(finiteNumber(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe("projectGeographicPoints", () => {
  it("compresses longitude by the cosine of the route's mean latitude", () => {
    // One degree of longitude covers less ground than one degree of latitude
    // away from the equator, so a square in degrees is not a square on the road.
    const projected = projectGeographicPoints([[-76, 40], [-75, 40], [-75, 41], [-76, 41]])
    const width = Math.abs(projected[1]![0] - projected[0]![0])
    const height = Math.abs(projected[2]![1] - projected[1]![1])
    expect(width).toBeLessThan(height)
    expect(width / height).toBeCloseTo(Math.cos(40.5 * Math.PI / 180), 3)
  })

  it("keeps a Pennsylvania route's drawn aspect faithful rather than stretched", () => {
    // A route one degree wide and one degree tall must not render square.
    const raw = normalizePoints([[-76, 40], [-75, 41]], { width: 100, height: 100, padding: 0 })
    const projected = normalizePoints(
      projectGeographicPoints([[-76, 40], [-75, 41]]),
      { width: 100, height: 100, padding: 0 }
    )
    expect(Math.abs(raw[1]!.x - raw[0]!.x)).toBeCloseTo(100, 5)
    expect(Math.abs(projected[1]!.x - projected[0]!.x)).toBeLessThan(80)
  })

  it("drops non-finite coordinates and survives an empty result", () => {
    expect(projectGeographicPoints([[Number.NaN, 40], [-75, Number.POSITIVE_INFINITY]])).toEqual([])
    expect(projectGeographicPoints([])).toEqual([])
  })
})
