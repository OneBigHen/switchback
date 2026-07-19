import { describe, expect, it } from "vitest"
import { routePointsFromSketch } from "@/lib/planner/route-sketch"
import type { Waypoint } from "@/lib/routing/types"

const start: Waypoint = { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
const finish: Waypoint = { lat: 39.8309, lon: -77.2311, label: "Gettysburg" }

describe("rough route sketch conversion", () => {
  it("preserves destination endpoints and turns the interior trace into shaping stops", () => {
    const result = routePointsFromSketch({
      mode: "destination",
      start,
      finish,
      trace: [
        { ...start },
        { lat: 40.21, lon: -76.98 },
        { lat: 40.08, lon: -77.08 },
        { lat: 39.94, lon: -77.18 },
        { ...finish }
      ]
    })

    expect(result.start).toEqual(start)
    expect(result.finish).toEqual(finish)
    expect(result.via).toEqual([
      { lat: 40.21, lon: -76.98, label: "Sketch stop 1" },
      { lat: 40.08, lon: -77.08, label: "Sketch stop 2" },
      { lat: 39.94, lon: -77.18, label: "Sketch stop 3" }
    ])
  })

  it("simplifies a dense stroke to the provider's eight-point route budget", () => {
    const trace = Array.from({ length: 24 }, (_, index) => ({
      lat: 40.24 - index * 0.012,
      lon: -76.92 - index * 0.011
    }))

    const result = routePointsFromSketch({
      mode: "destination",
      start,
      finish,
      trace
    })

    expect(result.via).toHaveLength(6)
    expect([result.start, ...result.via, result.finish]).toHaveLength(8)
    expect(result.via.map((point) => point.lon)).toEqual(
      [...result.via.map((point) => point.lon)].sort((a, b) => b - a)
    )
  })

  it("keeps a loop anchored at its start and removes duplicate start samples", () => {
    const result = routePointsFromSketch({
      mode: "loop",
      start,
      finish,
      trace: [
        { ...start },
        { lat: 40.42, lon: -76.72 },
        { lat: 40.36, lon: -76.54 },
        { lat: 40.18, lon: -76.66 },
        { ...start }
      ]
    })

    expect(result).toEqual({
      start,
      finish: null,
      via: [
        { lat: 40.42, lon: -76.72, label: "Sketch stop 1" },
        { lat: 40.36, lon: -76.54, label: "Sketch stop 2" },
        { lat: 40.18, lon: -76.66, label: "Sketch stop 3" }
      ]
    })
  })

  it("rejects a tap or tiny accidental stroke", () => {
    expect(() => routePointsFromSketch({
      mode: "destination",
      start,
      finish,
      trace: [
        { lat: 40.1, lon: -76.8 },
        { lat: 40.1001, lon: -76.8001 }
      ]
    })).toThrow(/draw a longer line/i)
  })
})
