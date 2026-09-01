import { describe, expect, it } from "vitest"
import { routeSketchWaypoints, type ScreenPoint } from "@/components/planner/map-drawing"

const map = {
  unproject([x, y]: [number, number]) {
    return { lng: x / 1000, lat: y / 1000 }
  }
}

describe("routeSketchWaypoints", () => {
  it("simplifies a normal finger stroke before creating routing stops", () => {
    const points: ScreenPoint[] = Array.from({ length: 25 }, (_, index) => ({
      x: index * 10,
      y: 120 + Math.sin(index / 3) * 18
    }))

    const waypoints = routeSketchWaypoints(map as never, points)

    expect(waypoints.length).toBeGreaterThanOrEqual(2)
    expect(waypoints.length).toBeLessThanOrEqual(12)
    expect(waypoints[0]).toEqual({ lon: 0, lat: 0.12 })
    expect(waypoints.at(-1)).toEqual({ lon: 0.24, lat: Number((points.at(-1)!.y / 1000).toFixed(6)) })
  })

  it("preserves corners while removing dense points on straight segments", () => {
    const points: ScreenPoint[] = [
      ...Array.from({ length: 11 }, (_, index) => ({ x: index * 10, y: 100 })),
      ...Array.from({ length: 10 }, (_, index) => ({ x: 100, y: 110 + index * 10 }))
    ]

    const waypoints = routeSketchWaypoints(map as never, points)

    expect(waypoints.length).toBeLessThanOrEqual(12)
    expect(waypoints).toContainEqual({ lon: 0.1, lat: 0.1 })
    expect(waypoints[0]).toEqual({ lon: 0, lat: 0.1 })
    expect(waypoints.at(-1)).toEqual({ lon: 0.1, lat: 0.2 })
  })
})
