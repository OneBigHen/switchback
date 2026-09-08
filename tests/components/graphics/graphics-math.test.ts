import { describe, expect, it } from "vitest"
import { clamp01, finiteNumber, normalizePoints } from "@/components/graphics/graphics-math"

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
