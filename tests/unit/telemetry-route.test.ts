import { describe, expect, it } from "vitest"
import type { PlannedRoute } from "@/lib/routing/types"
import {
  routeTelemetryProperties,
  routeTelemetryMode,
  telemetryFailureClass
} from "@/lib/telemetry/route"

function route(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "private-route-id",
    name: "Private route name",
    profile: "balanced",
    geometry: [[-76.9, 40.2], [-76.8, 40.3]],
    waypoints: [
      { lat: 40.2, lon: -76.9 },
      { lat: 40.3, lon: -76.8 }
    ],
    instructions: [],
    distanceMiles: 42,
    durationMinutes: 68,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 55,
    turnCount: 14,
    roadMix: { secondary: 70 },
    surfaceMix: { asphalt: 60, gravel: 40 },
    routingSource: "live",
    provider: "graphhopper",
    previewOnly: false,
    ...overrides
  }
}

describe("safe route telemetry summaries", () => {
  it("emits aggregate bands and provider categories without route identity or geometry", () => {
    const selected = route({ routeScore: { total: 90 } as PlannedRoute["routeScore"] })
    const alternative = route({
      id: "another-private-route-id",
      provider: "valhalla",
      durationMinutes: 82,
      distanceMiles: 58,
      surfaceMix: { asphalt: 100 }
    })

    const properties = routeTelemetryProperties(selected, [selected, alternative], {
      routeMode: "destination",
      routeSource: "manual"
    })

    expect(properties).toEqual({
      route_mode: "destination",
      route_source: "manual",
      provider_set: "graphhopper+valhalla",
      distance_band: "25-75mi",
      duration_band: "30-90m",
      detour_band: "none",
      waypoint_count_band: "2-3",
      candidate_count: 2,
      surface_mix_band: "mixed",
      traffic_evidence_present: false,
      selected_candidate_role: "best-ride"
    })
    expect(properties).not.toHaveProperty("id")
    expect(properties).not.toHaveProperty("geometry")
    expect(properties).not.toHaveProperty("waypoints")
  })

  it("derives loop mode from round-trip requests without retaining coordinates", () => {
    expect(routeTelemetryMode({ points: [{ lat: 40, lon: -76 }], roundTrip: { targetMinutes: 120 } })).toBe("loop")
    expect(routeTelemetryMode({ points: [{ lat: 40, lon: -76 }, { lat: 41, lon: -77 }] })).toBe("destination")
    expect(routeTelemetryMode({ points: [] })).toBe("unknown")
  })

  it("normalizes provider and application error codes into bounded classes", () => {
    expect(telemetryFailureClass("ROUTER_UNREACHABLE")).toBe("provider-unavailable")
    expect(telemetryFailureClass("ROUTE_PLANNING_FAILED")).toBe("provider-failure")
    expect(telemetryFailureClass("AbortError")).toBe("cancelled")
    expect(telemetryFailureClass("some-private-server-message")).toBe("unknown")
  })
})
