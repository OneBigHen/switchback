import { describe, expect, it, vi } from "vitest"
import type { Map as MapLibreMap } from "maplibre-gl"
import { fitSelectedRoute } from "@/components/planner/map-stage-navigation"
import type { PlannedRoute } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "canvas-fit-route",
  name: "Canvas fit route",
  profile: "twisty",
  geometry: [[-76.9, 40.2], [-76.8, 40.3]],
  waypoints: [],
  instructions: [],
  distanceMiles: 12,
  durationMinutes: 20,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 60,
  turnCount: 10,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

describe("selected-route map fitting", () => {
  it("derives padding from the actual short-landscape map canvas", () => {
    // This is a compact application viewport with a shorter drawable map.
    // Set app width explicitly so this test cannot accidentally inherit the
    // jsdom desktop default and contradict the separate topology-width tests.
    window.innerWidth = 568
    window.innerHeight = 320

    const fitBounds = vi.fn()
    const map = {
      getContainer: () => ({ clientWidth: 568, clientHeight: 320 }),
      fitBounds
    } as unknown as MapLibreMap

    fitSelectedRoute(map, {
      routes: [route],
      selectedRouteId: route.id,
      rideMode: false,
      sheetDetent: "half"
    })

    expect(fitBounds).toHaveBeenCalledOnce()
    expect(fitBounds.mock.calls[0]?.[1]).toMatchObject({
      padding: { top: 24, right: 24, bottom: 170, left: 24 },
      maxZoom: 15
    })
  })
})
