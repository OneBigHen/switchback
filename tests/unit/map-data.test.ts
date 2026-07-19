import { describe, expect, it } from "vitest"
import { buildRouteFeatures, buildWaypointFeatures } from "@/lib/client/map-data"
import type { PlannedRoute } from "@/lib/routing/types"

const route = (id: string): PlannedRoute => ({
  id,
  name: id,
  profile: "twisty",
  geometry: [[-76.9, 40.2], [-76.8, 40.3]],
  waypoints: [],
  instructions: [],
  distanceMiles: 10,
  durationMinutes: 20,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 60,
  turnCount: 10,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
})

describe("map GeoJSON builders", () => {
  it("marks only the active route selected and renders it last", () => {
    const collection = buildRouteFeatures([route("active"), route("other")], "active")

    expect(collection.features.map((feature) => feature.properties)).toEqual([
      { routeId: "other", selected: false, traversed: false },
      { routeId: "active", selected: true, traversed: false }
    ])
  })

  it("labels exact start and finish waypoint coordinates", () => {
    const collection = buildWaypointFeatures(
      { lat: 40.2, lon: -76.9, label: "Start" },
      { lat: 40.3, lon: -76.8, label: "Finish" }
    )

    expect(collection.features).toHaveLength(2)
    expect(collection.features[1]).toMatchObject({
      properties: { kind: "finish", marker: "F" },
      geometry: { coordinates: [-76.8, 40.3] }
    })
  })

  it("includes numbered shaping points as draggable via markers", () => {
    const collection = buildWaypointFeatures(
      { lat: 40.2, lon: -76.9, label: "Start" },
      { lat: 40.3, lon: -76.8, label: "Finish" },
      [{ lat: 40.25, lon: -76.85, label: "Brewery" }]
    )

    expect(collection.features[1]).toMatchObject({
      properties: { kind: "via", index: 0, marker: "1", label: "Brewery" },
      geometry: { coordinates: [-76.85, 40.25] }
    })
  })
})
