import { describe, expect, it, vi } from "vitest"
import type { Map as MapLibreMap } from "maplibre-gl"
import { updateReferenceMapSource } from "@/components/planner/map-stage-sources"
import { maplibreRenderer } from "@/components/planner/planner-map-renderer"
import type { ReferenceMap } from "@/lib/client/reference-map"

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
    }), "switchback-route-casing")
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
