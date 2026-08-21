import { describe, expect, it } from "vitest"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import {
  createRouteId,
  normalizeGraphHopperPath,
  normalizeGraphHopperProviderError,
  type GraphHopperPath
} from "@/lib/routing/graphhopper-response"

const request = normalizeRouteRequest({
  profile: "twisty",
  points: [
    { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
    { lat: 40.0379, lon: -76.3055, label: "Lancaster" }
  ]
})

const path: GraphHopperPath = {
  distance: 61_128.978,
  time: 4_335_684,
  ascend: 420,
  descend: 390,
  points: { coordinates: [
    [-76.8867, 40.2732],
    [-76.7, 40.15],
    [-76.5, 40.2],
    [-76.3055, 40.0379]
  ] },
  snapped_waypoints: { coordinates: [
    [-76.8866, 40.2731],
    [-76.3054, 40.038]
  ] },
  instructions: [
    { distance: 1_000, time: 80_000, sign: 0, text: "Continue", street_name: "Market Street", interval: [0, 1] },
    { distance: 800, time: 60_000, sign: 2, text: "Turn right", street_name: "River Road", interval: [1, 2] }
  ],
  details: {
    road_class: [[0, 1, "primary"], [1, 3, "secondary"]],
    surface: [[0, 3, "asphalt"]],
    max_speed: [[0, 3, "80"]],
    toll: [[0, 1, "NO"], [1, 3, "ALL"]]
  }
}

describe("GraphHopper response normalization", () => {
  it("normalizes geometry, instructions, speed, toll evidence, and route metadata", () => {
    const route = normalizeGraphHopperPath(path, request, 0)

    expect(route).toMatchObject({
      id: createRouteId("twisty", path.points!.coordinates!, 0),
      name: "Twisty route",
      profile: "twisty",
      distanceMiles: 37.98,
      durationMinutes: 72.26,
      ascentMeters: 420,
      descentMeters: 390,
      routingSource: "live",
      previewOnly: false,
      tollEvidence: { known: true, tollSharePercent: expect.closeTo(66.7, 0) }
    })
    expect(route.waypoints).toEqual([
      { lat: 40.2731, lon: -76.8866, label: "Harrisburg" },
      { lat: 40.038, lon: -76.3054, label: "Lancaster" }
    ])
    expect(route.instructions[1]).toMatchObject({
      streetName: "River Road",
      speedLimitKmh: 80
    })
  })

  it("keeps route IDs stable for identical profile, geometry, and index inputs", () => {
    const first = createRouteId("twisty", path.points!.coordinates!, 0)
    expect(first).toBe(createRouteId("twisty", path.points!.coordinates!, 0))
    expect(first).not.toBe(createRouteId("twisty", path.points!.coordinates!, 1))
  })

  it("normalizes provider errors without exposing raw routing details", () => {
    expect(normalizeGraphHopperProviderError(400, "Point 1 is out of bounds")).toMatchObject({
      code: "OUT_OF_COVERAGE",
      status: 400,
      message: expect.stringContaining("outside the installed routing region")
    })
  })
})
