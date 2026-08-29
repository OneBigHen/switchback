import { describe, expect, it, vi } from "vitest"
import type { Map as MapLibreMap } from "maplibre-gl"
import {
  countPlannerMapCreated,
  mapboxRenderer,
  maplibreRenderer,
  plannerMapsCreatedCount
} from "@/components/planner/planner-map-renderer"
import { addRiderMapLayers } from "@/components/planner/map-stage-sources"
import { resolveMapExperience } from "@/lib/client/map-experience"
import {
  roadCharacterLayer,
  routeRibbonLayers,
  ROAD_LOCK_LINE_LAYER,
  ROAD_LOCK_UNRESOLVED_LINE_LAYER,
  roadLockDashPaint,
  roadLockLineLayerIds
} from "@/components/planner/planner-map-layers"

function fakeMap() {
  const addLayer = vi.fn()
  const addSource = vi.fn()
  const moveLayer = vi.fn()
  const map = { addLayer, addSource, moveLayer } as unknown as MapLibreMap
  return { map, addLayer, addSource, moveLayer }
}

describe("Standard slot placement", () => {
  it("places premium layers by slot and never by a basemap layer id", () => {
    const { map, addLayer } = fakeMap()
    addRiderMapLayers(map, mapboxRenderer)
    expect(addLayer).toHaveBeenCalled()
    for (const [spec, beforeId] of addLayer.mock.calls) {
      expect(beforeId).toBeUndefined()
      expect(["bottom", "middle", "top"]).toContain(spec.slot)
      expect(String(spec.id).startsWith("switchback-")).toBe(true)
    }
  })

  it("keeps relative ordering on the renderer that has no slots", () => {
    const { map, addLayer } = fakeMap()
    addRiderMapLayers(map, maplibreRenderer)
    for (const [spec, beforeId] of addLayer.mock.calls) {
      expect(spec.slot).toBeUndefined()
      // The only ordering reference is another Switchback layer.
      expect(beforeId).toBe("switchback-route-shadow")
    }
  })

  it("reorders rider layers within their own slot rather than across slots", () => {
    const { map, moveLayer } = fakeMap()
    mapboxRenderer.moveLayer(map, "switchback-topo-raster", "switchback-route-casing")
    expect(moveLayer).toHaveBeenCalledWith("switchback-topo-raster")
    maplibreRenderer.moveLayer(map, "switchback-topo-raster", "switchback-route-casing")
    expect(moveLayer).toHaveBeenCalledWith("switchback-topo-raster", "switchback-route-casing")
  })
})

describe("road lock dashes", () => {
  it("keeps the unresolved-lock signal on a renderer without data-driven dashes", () => {
    expect(roadLockLineLayerIds(maplibreRenderer)).toEqual([ROAD_LOCK_LINE_LAYER])
    expect(roadLockDashPaint(maplibreRenderer, ROAD_LOCK_LINE_LAYER)["line-dasharray"]).toBeDefined()

    expect(roadLockLineLayerIds(mapboxRenderer))
      .toEqual([ROAD_LOCK_LINE_LAYER, ROAD_LOCK_UNRESOLVED_LINE_LAYER])
    expect(roadLockDashPaint(mapboxRenderer, ROAD_LOCK_LINE_LAYER)).toEqual({})
    expect(roadLockDashPaint(mapboxRenderer, ROAD_LOCK_UNRESOLVED_LINE_LAYER))
      .toEqual({ "line-dasharray": [2, 1.5] })
  })
})

describe("renderer glyphs", () => {
  it("uses a font stack each renderer can actually serve", () => {
    expect(maplibreRenderer.boldFont).toEqual(["Noto Sans Bold"])
    expect(mapboxRenderer.boldFont).not.toContain("Noto Sans Bold")
  })
})

describe("premium route ribbon", () => {
  const experience = (overrides: Partial<Parameters<typeof resolveMapExperience>[0]> = {}) =>
    resolveMapExperience({ experience: "standard", surface: "plan", lightPreset: "day", ...overrides })

  it("draws the route as a stack so it reads as an object, not a line", () => {
    const ids = routeRibbonLayers(mapboxRenderer, experience()).map((layer) => layer.id)
    expect(ids).toEqual([
      "switchback-route-shadow",
      "switchback-route-casing",
      "switchback-route-lines"
    ])
  })

  it("keeps the route lit when Standard's lighting would dim it", () => {
    const night = routeRibbonLayers(mapboxRenderer, experience({ lightPreset: "night" }))
    const core = night.find((layer) => layer.id === "switchback-route-lines")!
    expect((core as { paint: Record<string, unknown> }).paint["line-emissive-strength"]).toBeDefined()

    // The fallback renderer has no such property to set.
    const fallback = routeRibbonLayers(maplibreRenderer, experience({ lightPreset: "night" }))
      .find((layer) => layer.id === "switchback-route-lines")!
    expect((fallback as { paint: Record<string, unknown> }).paint["line-emissive-strength"]).toBeUndefined()
  })

  it("widens the ribbon for the high-contrast choice without losing the hierarchy", () => {
    const [, , standardCore] = routeRibbonLayers(mapboxRenderer, experience(), "standard")
    const [, , contrastCore] = routeRibbonLayers(mapboxRenderer, experience(), "high-contrast")
    const width = (layer: unknown) =>
      ((layer as { paint: { "line-width": [string, unknown, number, number] } }).paint["line-width"])[2]
    expect(width(contrastCore)).toBeGreaterThan(width(standardCore))
  })

  it("adds every ribbon layer to the top slot so 3D features cannot bury the route", () => {
    const { map, addLayer } = fakeMap()
    for (const layer of routeRibbonLayers(mapboxRenderer, experience())) {
      mapboxRenderer.addLayer(map, layer, { slot: "top" })
    }
    for (const [spec] of addLayer.mock.calls) expect(spec.slot).toBe("top")
  })
})

describe("road character layer", () => {
  it("scales the rider's own opacity through the curvature range", () => {
    const experience = resolveMapExperience({ experience: "standard", surface: "plan", lightPreset: "day" })
    const full = roadCharacterLayer(mapboxRenderer, experience, 1)
    const dimmed = roadCharacterLayer(mapboxRenderer, experience, 0.5)
    const strongest = (layer: unknown) =>
      (layer as { paint: { "line-opacity": unknown[] } }).paint["line-opacity"].at(-1) as number
    expect(strongest(full)).toBeCloseTo(0.85)
    expect(strongest(dimmed)).toBeCloseTo(0.425)
  })
})

describe("map load cost", () => {
  const config = (experience: "standard" | "terrain" | "satellite", lightPreset: "day" | "night") =>
    resolveMapExperience({ experience, surface: "plan", lightPreset })

  it("keeps one map instance across ordinary mode and lighting switching", () => {
    // Standard and Terrain are the same Mapbox style under different
    // configuration, and lighting is configuration too — so neither costs
    // another billable map load.
    const standardDay = mapboxRenderer.styleKey(config("standard", "day"))
    expect(mapboxRenderer.styleKey(config("terrain", "day"))).toBe(standardDay)
    expect(mapboxRenderer.styleKey(config("standard", "night"))).toBe(standardDay)
    expect(mapboxRenderer.styleKey(config("terrain", "night"))).toBe(standardDay)
  })

  it("only rebuilds the map for a genuinely different style", () => {
    // Standard Satellite is a different style; Mapbox gives no way to reach it
    // from Standard by configuration alone.
    expect(mapboxRenderer.styleKey(config("satellite", "day")))
      .not.toBe(mapboxRenderer.styleKey(config("standard", "day")))
  })

  it("counts every constructed map so the cost stays assertable", () => {
    const before = plannerMapsCreatedCount()
    countPlannerMapCreated()
    expect(plannerMapsCreatedCount()).toBe(before + 1)
  })
})
