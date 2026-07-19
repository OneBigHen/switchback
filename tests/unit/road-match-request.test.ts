import { describe, expect, it } from "vitest"
import { buildRoadMatchRequest } from "@/lib/planner/road-match-request"
import type { PlannedRoute } from "@/lib/routing/types"

const importedRoute: PlannedRoute = {
  id: "imported-track",
  name: "Forest connector",
  profile: "adventure",
  geometry: [[-77, 40], [-76.99, 40.01], [-76.98, 40.02], [-76.97, 40.03]],
  waypoints: [{ lat: 40, lon: -77, label: "Original start" }, { lat: 40.03, lon: -76.97, label: "Original finish" }],
  instructions: [],
  distanceMiles: 5,
  durationMinutes: 20,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 40,
  turnCount: 10,
  roadMix: {},
  surfaceMix: {},
  routingSource: "imported",
  previewOnly: false,
  avoidHighways: true,
  avoidAreas: [{ id: "closure", polygon: [[-77, 40], [-76.99, 40], [-76.99, 39.99]] }]
}

describe("road match request", () => {
  it("creates a new legal-road request without mutating the imported track", () => {
    const original = structuredClone(importedRoute)

    const matched = buildRoadMatchRequest(importedRoute)

    expect(importedRoute).toEqual(original)
    expect(matched.points.start).toMatchObject({ lat: 40, lon: -77, label: "Original start" })
    expect(matched.points.finish).toMatchObject({ lat: 40.03, lon: -76.97, label: "Original finish" })
    expect(matched.request).toMatchObject({
      profile: "adventure",
      compare: false,
      avoidHighways: true,
      avoidAreas: importedRoute.avoidAreas
    })
    expect(matched.request.points).toEqual([matched.points.start, ...matched.points.via, matched.points.finish])
  })

  it("rejects an imported line that has no usable endpoints", () => {
    expect(() => buildRoadMatchRequest({ ...importedRoute, geometry: [] })).toThrow(/no line to match/i)
  })
})
