import { describe, expect, it } from "vitest"
import { routeIntentFromSketch } from "@/lib/planner/route-sketch"
import type { Waypoint } from "@/lib/routing/types"

const point = (lat: number, lon: number, label?: string): Waypoint => ({ lat, lon, label })

const openTrace: Waypoint[] = [
  point(40.2732, -76.8867),
  point(40.285, -76.86),
  point(40.3, -76.83),
  point(40.318, -76.8),
  point(40.335, -76.77)
]

const closedTrace: Waypoint[] = [
  point(40.2732, -76.8867),
  point(40.292, -76.85),
  point(40.315, -76.87),
  point(40.299, -76.91),
  point(40.274, -76.887)
]

describe("routeIntentFromSketch", () => {
  it("infers destination endpoints from an open stroke with no anchors", () => {
    const result = routeIntentFromSketch({
      currentMode: "destination",
      start: null,
      finish: null,
      trace: openTrace,
      hasExistingRoute: false
    })

    expect(result.mode).toBe("destination")
    expect(result.points.start).toMatchObject({ lat: openTrace[0]!.lat, lon: openTrace[0]!.lon, label: "Sketch start" })
    expect(result.points.finish).toMatchObject({ lat: openTrace.at(-1)!.lat, lon: openTrace.at(-1)!.lon, label: "Sketch finish" })
    expect(result.points.via.length).toBeGreaterThan(0)
  })

  it("infers loop intent from a near-closed stroke with no anchors", () => {
    const result = routeIntentFromSketch({
      currentMode: "destination",
      start: null,
      finish: null,
      trace: closedTrace,
      hasExistingRoute: false
    })

    expect(result.mode).toBe("loop")
    expect(result.points.start).toMatchObject({ lat: closedTrace[0]!.lat, lon: closedTrace[0]!.lon, label: "Sketch start" })
    expect(result.points.finish).toBeNull()
    expect(result.points.via.length).toBeGreaterThan(0)
  })

  it("preserves explicit endpoints while reshaping an existing destination route", () => {
    const start = point(40.25, -76.92, "Start")
    const finish = point(40.36, -76.74, "Finish")
    const result = routeIntentFromSketch({
      currentMode: "destination",
      start,
      finish,
      trace: openTrace,
      hasExistingRoute: true
    })

    expect(result.mode).toBe("destination")
    expect(result.points.start).toEqual(start)
    expect(result.points.finish).toEqual(finish)
    expect(result.points.via.length).toBeGreaterThan(0)
  })

  it("rejects a gesture too short to express a road corridor", () => {
    expect(() => routeIntentFromSketch({
      currentMode: "destination",
      start: null,
      finish: null,
      trace: [point(40.2732, -76.8867), point(40.2733, -76.8866)],
      hasExistingRoute: false
    })).toThrow(/longer line/i)
  })

  it("keeps inferred route points within the routing waypoint budget", () => {
    const longTrace = Array.from({ length: 40 }, (_, index) => point(40.27 + index * 0.003, -76.9 + index * 0.004))
    const result = routeIntentFromSketch({
      currentMode: "destination",
      start: null,
      finish: null,
      trace: longTrace,
      hasExistingRoute: false
    })

    expect(result.points.via.length).toBeLessThanOrEqual(6)
  })
})
