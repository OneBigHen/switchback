import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import type { Map as MapLibreMap } from "maplibre-gl"
import {
  updatePlannerSources,
  updateReferenceMapSource,
  type SwitchbackMapSourcesDebug
} from "@/components/planner/map-stage-sources"
import { maplibreRenderer } from "@/components/planner/planner-map-renderer"
import type { ReferenceMap } from "@/lib/client/reference-map"
import type { PlannedRoute } from "@/lib/routing/types"

function referenceMap(): ReferenceMap {
  return {
    id: "reference-1",
    name: "Forest route screenshot",
    url: "blob:reference",
    opacity: 0.55,
    coordinates: [
      [-77, 40],
      [-76, 40],
      [-76, 39],
      [-77, 39]
    ]
  }
}

describe("reference map source lifecycle", () => {
  it("adds a new image source and keeps its opacity synchronized", () => {
    const addSource = vi.fn()
    const addLayer = vi.fn()
    const setPaintProperty = vi.fn()
    const map = {
      getSource: vi.fn(),
      getLayer: vi.fn(),
      addSource,
      addLayer,
      setPaintProperty,
      removeLayer: vi.fn(),
      removeSource: vi.fn()
    } as unknown as MapLibreMap

    updateReferenceMapSource(map, referenceMap(), maplibreRenderer)

    expect(addSource).toHaveBeenCalledWith("switchback-reference-map", expect.objectContaining({
      type: "image",
      url: "blob:reference"
    }))
    expect(addLayer).toHaveBeenCalledWith(expect.objectContaining({
      id: "switchback-reference-map-layer",
      source: "switchback-reference-map"
    }), "switchback-route-shadow")
    expect(setPaintProperty).toHaveBeenCalledWith("switchback-reference-map-layer", "raster-opacity", 0.55)
  })

  it("removes both image layer and source when the reference is cleared", () => {
    const removeLayer = vi.fn()
    const removeSource = vi.fn()
    const map = {
      getSource: vi.fn().mockReturnValue({}),
      getLayer: vi.fn().mockReturnValue({}),
      removeLayer,
      removeSource
    } as unknown as MapLibreMap

    updateReferenceMapSource(map, null, maplibreRenderer)

    expect(removeLayer).toHaveBeenCalledWith("switchback-reference-map-layer")
    expect(removeSource).toHaveBeenCalledWith("switchback-reference-map")
  })
})

function route(id: string, geometry: PlannedRoute["geometry"]): PlannedRoute {
  return {
    id,
    name: id === "new" ? "Grounded stop route" : "Original route",
    profile: "balanced",
    geometry,
    waypoints: [],
    instructions: [],
    distanceMiles: id === "new" ? 44 : 42,
    durationMinutes: id === "new" ? 76 : 72,
    ascentMeters: null,
    descentMeters: null,
    twistiness: id === "new" ? 68 : 61,
    turnCount: id === "new" ? 34 : 30,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

describe("planner map source lifecycle", () => {
  it("replaces route, label, and waypoint data after canonical planner changes", () => {
    const routeSource = { setData: vi.fn() }
    const labelSource = { setData: vi.fn() }
    const waypointSource = { setData: vi.fn() }
    const sources: Record<string, { setData: (data: unknown) => void }> = {
      "switchback-routes": routeSource,
      "switchback-route-labels": labelSource,
      "switchback-waypoints": waypointSource
    }
    const map = {
      getSource: vi.fn((id: string) => sources[id])
    } as unknown as MapLibreMap
    const original = route("old", [[-75.16, 40.18], [-75.28, 40.31]])
    const changed = route("new", [[-75.16, 40.18], [-75.18, 40.22], [-75.28, 40.31]])
    const stop = { lat: 40.245, lon: -75.22, label: "Actual Diner" }

    updatePlannerSources(map, {
      routes: [original],
      selectedRouteId: original.id,
      start: { lat: 40.18, lon: -75.16, label: "Start" },
      finish: { lat: 40.31, lon: -75.28, label: "Finish" },
      via: [],
      avoidAreas: [],
      rideMode: false
    })
    updatePlannerSources(map, {
      routes: [changed],
      selectedRouteId: changed.id,
      start: { lat: 40.18, lon: -75.16, label: "Start" },
      finish: { lat: 40.31, lon: -75.28, label: "Finish" },
      via: [stop],
      avoidAreas: [],
      rideMode: false
    })

    const routeData = routeSource.setData.mock.lastCall?.[0] as ReturnType<typeof import("@/lib/client/map-data").buildRouteFeatures>
    const labelData = labelSource.setData.mock.lastCall?.[0] as ReturnType<typeof import("@/lib/client/map-data").buildRouteLabelFeatures>
    const waypointData = waypointSource.setData.mock.lastCall?.[0] as ReturnType<typeof import("@/lib/client/map-data").buildWaypointFeatures>
    expect(routeData.features).toHaveLength(1)
    expect(routeData.features[0]).toMatchObject({
      properties: { routeId: "new", selected: true },
      geometry: { coordinates: changed.geometry }
    })
    expect(labelData.features[0]).toMatchObject({
      properties: { routeId: "new", selected: true, name: "Grounded stop route" }
    })
    expect(waypointData.features).toContainEqual(expect.objectContaining({
      properties: expect.objectContaining({ kind: "via", label: "Actual Diner" }),
      geometry: { type: "Point", coordinates: [-75.22, 40.245] }
    }))
  })
})

describe("E2E map sources debug seam", () => {
  let debug: SwitchbackMapSourcesDebug

  beforeEach(() => {
    Reflect.deleteProperty(window, "__switchbackMapSourcesDebug")
  })

  afterEach(() => {
    Reflect.deleteProperty(window, "__switchbackMapSourcesDebug")
  })

  function fakePlannerMap() {
    const routeDataHolder: { data: unknown } = { data: null }
    const routeSource = {
      type: "geojson",
      setData: vi.fn((data: unknown) => {
        routeDataHolder.data = data
      }),
      getData: vi.fn(async () => routeDataHolder.data)
    }
    const sources: Record<string, unknown> = {
      "switchback-routes": routeSource,
      "switchback-route-labels": { type: "geojson", setData: vi.fn() },
      "switchback-waypoints": { type: "geojson", setData: vi.fn() },
      "switchback-avoid-areas": { type: "geojson", setData: vi.fn() },
      "switchback-navigation": { type: "geojson", setData: vi.fn() },
      "switchback-reference-map": { type: "image" }
    }
    const map = {
      getSource: (id: string) => sources[id],
      getStyle: () => ({ sources })
    } as unknown as MapLibreMap
    return { map, routeSource }
  }

  function plannerProps(routes: PlannedRoute[]) {
    return {
      routes,
      selectedRouteId: routes[0]!.id,
      start: null,
      finish: null,
      via: [],
      avoidAreas: [],
      rideMode: false
    }
  }

  it("exposes the live source data through the seam without duplicating it", async () => {
    const { map, routeSource } = fakePlannerMap()
    const original = route("old", [[-75.16, 40.18], [-75.28, 40.31]])
    const changed = route("new", [[-75.16, 40.18], [-75.18, 40.22], [-75.28, 40.31]])

    updatePlannerSources(map, plannerProps([original]))
    debug = window.__switchbackMapSourcesDebug!
    expect(debug).toBeTruthy()

    const before = (await debug.getSourceData("switchback-routes")) as {
      features: Array<{ properties: { routeId: string; selected: boolean } }>
    } | null
    expect(before).toEqual(routeSource.setData.mock.calls[0]?.[0])
    expect(before!.features).toHaveLength(1)
    expect(before!.features[0]).toMatchObject({
      properties: { routeId: "old", selected: true }
    })

    updatePlannerSources(map, plannerProps([changed]))
    const after = (await debug.getSourceData("switchback-routes")) as {
      features: Array<{ properties: { routeId: string; selected: boolean } }>
    } | null
    expect(after).toEqual(routeSource.setData.mock.lastCall?.[0])
    expect(after!.features).toHaveLength(1)
    expect(after!.features[0]).toMatchObject({
      properties: { routeId: "new", selected: true }
    })

    expect(debug.getUpdateCount("switchback-routes")).toBe(2)
    debug.resetUpdateCounts()
    expect(debug.getUpdateCount("switchback-routes")).toBe(0)
    expect(debug.listSourceIds()).toContain("switchback-routes")
    await expect(debug.getSourceData("switchback-reference-map")).resolves.toBeNull()
    await expect(debug.getSourceData("switchback-missing")).resolves.toBeNull()
  })
})
