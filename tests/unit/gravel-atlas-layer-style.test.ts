import { describe, expect, it } from "vitest"
import { addRiderMapLayers, riderFeatureLayerIds, riderLayerLinePaint } from "@/components/planner/map-stage-sources"

describe("Gravel Atlas map presentation", () => {
  it("renders known gravel as a distinct tan dashed road layer", () => {
    const paint = riderLayerLinePaint("gravel-atlas")

    expect(paint["line-color"]).toBe("#B88955")
    expect(paint["line-dasharray"]).toEqual([2, 1.5])
    expect(paint["line-width"]).toBeGreaterThan(2.5)
    expect(paint["line-opacity"]).toBeGreaterThanOrEqual(0.85)
  })

  it("does not apply the gravel dash treatment to unrelated feature layers", () => {
    expect(riderLayerLinePaint("weather")["line-dasharray"]).toBeUndefined()
    expect(riderLayerLinePaint("public-land")["line-dasharray"]).toBeUndefined()
  })
})

describe("rider overlay geometry routing", () => {
  it("draws each geometry only in its own layer so a corridor line never becomes a filled wedge or a chain of dots", () => {
    const layers: Array<{ id: string; type: string; filter: unknown }> = []
    const map = { addSource: () => undefined } as unknown as Parameters<typeof addRiderMapLayers>[0]
    const renderer = {
      addLayer: (_map: unknown, layer: { id: string; type: string; filter: unknown }) => { layers.push(layer) }
    } as unknown as Parameters<typeof addRiderMapLayers>[1]

    addRiderMapLayers(map, renderer)

    const [fill, line, circle] = riderFeatureLayerIds("gravel-atlas").map((id) => layers.find((layer) => layer.id === id))
    expect(fill?.type).toBe("fill")
    expect(line?.type).toBe("line")
    expect(circle?.type).toBe("circle")
    const text = (value: unknown) => JSON.stringify(value)
    expect(text(fill?.filter)).toContain("gravel-atlas")
    expect(text(fill?.filter)).toContain("Polygon")
    expect(text(fill?.filter)).not.toContain("LineString")
    expect(text(line?.filter)).toContain("LineString")
    expect(text(circle?.filter)).toContain("Point")
    expect(text(circle?.filter)).not.toContain("LineString")
  })
})
