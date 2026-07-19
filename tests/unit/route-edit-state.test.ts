import { describe, expect, it } from "vitest"
import { routeEditState } from "@/lib/planner/route-edit-state"
import type { PlannedRoute } from "@/lib/routing/types"

function route(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "saved-loop",
    name: "Saved loop",
    profile: "adventure",
    geometry: [[-76.9, 40.2], [-76.7, 40.3], [-76.9, 40.2]],
    waypoints: [
      { lat: 40.2, lon: -76.9, label: "Home" },
      { lat: 40.3, lon: -76.7, label: "Gravel stop" },
      { lat: 40.2, lon: -76.9, label: "Home" }
    ],
    instructions: [],
    distanceMiles: 42,
    durationMinutes: 118,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 70,
    turnCount: 40,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false,
    loopTargetMinutes: 120,
    ...overrides
  }
}

describe("route edit state", () => {
  it("restores a saved loop, its timebox, and only its shaping stops", () => {
    expect(routeEditState(route())).toEqual({
      mode: "loop",
      targetMinutes: 120,
      start: { lat: 40.2, lon: -76.9, label: "Home" },
      finish: null,
      via: [{ lat: 40.3, lon: -76.7, label: "Gravel stop" }]
    })
  })

  it("keeps an open imported route in destination mode", () => {
    const open = route({
      loopTargetMinutes: undefined,
      geometry: [[-76.9, 40.2], [-76.4, 40.5]],
      waypoints: [
        { lat: 40.2, lon: -76.9, label: "Start" },
        { lat: 40.5, lon: -76.4, label: "Finish" }
      ]
    })
    expect(routeEditState(open)).toMatchObject({
      mode: "destination",
      start: { label: "Start" },
      finish: { label: "Finish" },
      via: []
    })
  })
})
