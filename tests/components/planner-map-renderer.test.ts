import { describe, expect, it, vi } from "vitest"
import type { Map as MapLibreMap } from "maplibre-gl"
import { mapboxRenderer, maplibreRenderer } from "@/components/planner/planner-map-renderer"
import { addRiderMapLayers } from "@/components/planner/map-stage-sources"
import {
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
      expect(beforeId).toBe("switchback-route-casing")
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
