import { describe, expect, it } from "vitest"
import { buildRouteDecisionPresentation } from "@/components/planner/v2/RouteDecisionCard"
import type { PlannedRoute } from "@/lib/routing/types"

/**
 * Most shared Route Library tracks and many personal GPX imports carry no
 * timing. Opening one in the planner must not present that unknown as a
 * confident "0 min" ride.
 */
function importedTrack(durationMinutes: number): PlannedRoute {
  return {
    id: "atlas-42",
    name: "Bald Eagle Loop",
    profile: "scenic",
    geometry: [[-77.9, 40.75], [-77.25, 41.1]],
    waypoints: [],
    instructions: [],
    distanceMiles: 104.7,
    durationMinutes,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 62,
    turnCount: 118,
    roadMix: {},
    surfaceMix: {},
    routingSource: "imported",
    navigationMode: "track-only",
    previewOnly: false
  }
}

describe("imported track duration truth", () => {
  it("labels an unknown imported duration as unknown instead of 0 min", () => {
    const route = importedTrack(0)
    const presentation = buildRouteDecisionPresentation(route, [route], route.id)
    expect(presentation.timeLabel).toBe("Time unknown")
  })

  it("keeps a real duration", () => {
    const route = importedTrack(188)
    expect(buildRouteDecisionPresentation(route, [route], route.id).timeLabel).toBe("188 min")
  })
})
