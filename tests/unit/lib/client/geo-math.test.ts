import { describe, expect, it } from "vitest"
import { polylineDistanceMeters, turfDistance } from "@/lib/client/geo-math"

describe("polylineDistanceMeters", () => {
  it("returns zero for an empty or one-point line", () => {
    expect(polylineDistanceMeters([])).toBe(0)
    expect(polylineDistanceMeters([[-77, 40]])).toBe(0)
  })

  it("measures a known one-degree segment", () => {
    expect(polylineDistanceMeters([[0, 0], [1, 0]])).toBeCloseTo(111_195, 0)
  })

  it("sums each adjacent segment", () => {
    const geometry = [[0, 0], [1, 0], [1, 1]] as [number, number][]

    expect(polylineDistanceMeters(geometry)).toBeCloseTo(
      turfDistance(geometry[0]!, geometry[1]!) + turfDistance(geometry[1]!, geometry[2]!),
      8
    )
  })
})
