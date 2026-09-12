import { describe, expect, it, vi } from "vitest"
import type { Map as MapLibreMap } from "maplibre-gl"
import { updatePlannerSources } from "@/components/planner/map-stage-sources"
import type { PlannedRoute } from "@/lib/routing/types"

// Proof that the E2E-only map sources debug seam is inert in a production
// runtime. The standard suite runs with NODE_ENV=test (seam enabled), so this
// test skips there. Run it explicitly with:
//   NODE_ENV=production npx vitest run tests/unit/map-source-debug-production-gate.test.ts

function route(id: string): PlannedRoute {
  return {
    id,
    name: "Original route",
    profile: "balanced",
    geometry: [[-75.16, 40.18], [-75.28, 40.31]],
    waypoints: [],
    instructions: [],
    distanceMiles: 42,
    durationMinutes: 72,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 61,
    turnCount: 30,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

describe("map sources debug seam production gate", () => {
  it("never installs the seam when NODE_ENV is production", async (ctx) => {
    if (process.env.NODE_ENV !== "production") return ctx.skip()

    const routeSource = {
      type: "geojson",
      setData: vi.fn(),
      getData: vi.fn(async () => null)
    }
    const map = {
      getSource: (id: string) => (id === "switchback-routes" ? routeSource : null),
      getStyle: () => ({ sources: { "switchback-routes": routeSource } })
    } as unknown as MapLibreMap

    updatePlannerSources(map, {
      routes: [route("old")],
      selectedRouteId: "old",
      start: null,
      finish: null,
      via: [],
      avoidAreas: [],
      rideMode: false
    })

    expect(routeSource.setData).toHaveBeenCalled()
    expect(window.__switchbackMapSourcesDebug).toBeUndefined()
  })
})
