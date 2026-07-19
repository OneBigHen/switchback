import { describe, expect, it } from "vitest"
import { appendSketchPoint, avoidAreaPolygon, createAvoidArea, hasUsableSketch, routeSketchWaypoints } from "@/components/planner/map-drawing"

describe("map drawing domain helpers", () => {
  it("names avoid areas in rider-visible creation order", () => {
    expect(createAvoidArea("avoid-1", 2, [[-77, 40], [-76.9, 40], [-76.9, 39.9], [-77, 39.9]]))
      .toMatchObject({ id: "avoid-1", name: "Avoid area 3" })
  })

  it("turns a deliberate screen rectangle into a clockwise map polygon", () => {
    const map = {
      unproject: ([x, y]: [number, number]) => ({ lng: -77 + x / 100, lat: 40 + y / 100 })
    }
    expect(avoidAreaPolygon(map as never, { x: 10, y: 20 }, { x: 50, y: 60 })).toEqual([
      [-76.9, 40.2], [-76.5, 40.2], [-76.5, 40.6], [-76.9, 40.6]
    ])
    expect(avoidAreaPolygon(map as never, { x: 10, y: 20 }, { x: 20, y: 60 })).toBeNull()
  })

  it("samples deliberate sketch movement and converts it into route waypoints", () => {
    const start = [{ x: 0, y: 0 }]
    expect(appendSketchPoint(start, { x: 3, y: 3 })).toEqual(start)
    const points = appendSketchPoint(start, { x: 30, y: 0 })
    expect(hasUsableSketch(points)).toBe(true)
    const map = { unproject: ([x, y]: [number, number]) => ({ lng: -77 + x / 100, lat: 40 + y / 100 }) }
    expect(routeSketchWaypoints(map as never, points)).toEqual([
      { lon: -77, lat: 40 }, { lon: -76.7, lat: 40 }
    ])
  })
})
