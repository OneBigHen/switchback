import { describe, expect, it } from "vitest"
import { buildGpxJoinPreview, joinGpxRoute, resolveGpxJoinCandidate } from "@/lib/gpx/join"
import { buildNavigationModel, updateNavigation } from "@/lib/client/navigation-engine"
import type { PlannedRoute } from "@/lib/routing/types"

const gpxRoute: PlannedRoute = {
  id: "gpx-track",
  name: "Trail line",
  profile: "scenic",
  geometry: [[-77, 40], [-76.99, 40], [-76.98, 40], [-76.97, 40], [-76.96, 40]],
  waypoints: [
    { lat: 40, lon: -77, label: "Trail start" },
    { lat: 40, lon: -76.98, label: "Ridge entry" },
    { lat: 40, lon: -76.96, label: "Trail finish" }
  ],
  instructions: [],
  distanceMiles: 2.1,
  durationMinutes: 30,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 20,
  turnCount: 0,
  roadMix: {},
  surfaceMix: {},
  navigationMode: "track-only",
  routingSource: "imported",
  previewOnly: false
}

const approach: PlannedRoute = {
  ...gpxRoute,
  id: "approach",
  name: "Approach",
  geometry: [[-77.02, 39.99], [-77.01, 39.995], [-76.98, 40]],
  waypoints: [{ lat: 39.99, lon: -77.02, label: "Current location" }, { lat: 40, lon: -76.98, label: "Ridge entry" }],
  instructions: [{
    distanceMeters: 2_000,
    timeMilliseconds: 180_000,
    sign: 0,
    text: "Continue",
    streetName: "Approach Road",
    interval: [0, 2]
  }],
  distanceMiles: 2.2,
  durationMinutes: 4,
  routingSource: "live",
  previewOnly: false
}

describe("GPX join planning", () => {
  it("offers best, original, and forward waypoint entries with bounded candidates", () => {
    const preview = buildGpxJoinPreview(gpxRoute.geometry, gpxRoute.waypoints, [-76.995, 39.995])
    expect(preview.candidates.length).toBeLessThanOrEqual(32)
    expect(preview.bestIndex).not.toBeNull()
    expect(preview.candidates.some((candidate) => candidate.kind === "original-start")).toBe(true)
    expect(preview.candidates.some((candidate) => candidate.kind === "waypoint")).toBe(true)
    expect(resolveGpxJoinCandidate(preview, "best").index).toBeGreaterThanOrEqual(0)
  })

  it("rejects a pathological remote entry instead of creating a fake approach", () => {
    const preview = buildGpxJoinPreview(gpxRoute.geometry, gpxRoute.waypoints, [-75, 41])
    expect(preview.bestIndex).toBeNull()
    expect(() => resolveGpxJoinCandidate(preview, "best")).toThrow(/safe GPX entry/i)
  })

  it("composes approach instructions before the GPX track without announcing arrival at entry", () => {
    const preview = buildGpxJoinPreview(gpxRoute.geometry, gpxRoute.waypoints, [-77.02, 39.99])
    const candidate = resolveGpxJoinCandidate(preview, 2)
    const joined = joinGpxRoute(gpxRoute, approach, candidate)

    expect(joined.navigationMode).toBe("continuous-track")
    expect(joined.gpxLegStartIndex).toBeGreaterThan(0)
    expect(joined.instructions[0]?.text).toBe("Continue")
    expect(joined.gpxParentRouteId).toBe("gpx-track")
    expect(joined.derivativeProvenance?.visibility).toBe("private")
    expect(joined.geometry.at(-1)).toEqual(gpxRoute.geometry.at(-1))
    const entryFrame = updateNavigation(buildNavigationModel(joined), {
      coordinate: [-76.98, 40],
      accuracyMeters: 5,
      headingDegrees: 90,
      speedMetersPerSecond: 8,
      timestamp: 1_000
    })
    expect(entryFrame.status).toBe("navigating")
    expect(entryFrame.instruction).toBeNull()
  })
})
