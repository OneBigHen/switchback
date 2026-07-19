import { describe, expect, it } from "vitest"
import {
  applyRiderMapPack,
  catalogLayerSettings,
  defaultRiderLayerSettings,
  layerCatalog,
  mapStyleUrl,
  mapLayerRuntime,
  normalizeRiderLayerSettings,
  paUnpavedRoadsQuery,
  shouldShowBaseMapFailure
} from "@/lib/client/map-layers"

describe("map layer settings", () => {
  it("maps rider-friendly style names to OpenFreeMap styles", () => {
    expect(mapStyleUrl("clean")).toMatch(/positron$/)
    expect(mapStyleUrl("explorer")).toMatch(/liberty$/)
    expect(mapStyleUrl("night")).toMatch(/fiord$/)
  })

  it("builds a bounded PA unpaved-road viewport query only at useful zoom", () => {
    expect(paUnpavedRoadsQuery({ west: -77.2, south: 40.1, east: -76.6, north: 40.6 }, 6)).toBeNull()
    expect(paUnpavedRoadsQuery({ west: -77.2, south: 40.1, east: -76.6, north: 40.6 }, 7))
      .toBe("bbox=-77.2%2C40.1%2C-76.6%2C40.6&zoom=7&limit=500")
    expect(paUnpavedRoadsQuery({ west: -77.2, south: 40.1, east: -76.6, north: 40.6 }, 10))
      .toBe("bbox=-77.2%2C40.1%2C-76.6%2C40.6&zoom=10&limit=500")
    expect(paUnpavedRoadsQuery({ west: -80, south: 38, east: -72, north: 43 }, 8)).toBeNull()
  })

  it("ignores recoverable tile errors after the initial style has rendered", () => {
    expect(shouldShowBaseMapFailure(false, false)).toBe(true)
    expect(shouldShowBaseMapFailure(true, false)).toBe(false)
    expect(shouldShowBaseMapFailure(true, true)).toBe(false)
  })

  it("ships functional map layers with provenance and safely normalizes saved settings", () => {
    expect(layerCatalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "curvature", source: expect.stringMatching(/Switchback/i) }),
      expect.objectContaining({ id: "weather", freshness: expect.any(String) }),
      expect.objectContaining({ id: "fuel", coverage: expect.any(String) }),
      expect.objectContaining({ id: "mvum", status: "live" })
    ]))
    expect(layerCatalog.every((layer) => layer.status !== "planned")).toBe(true)
    expect(layerCatalog.every((layer) => mapLayerRuntime(layer.id) !== null)).toBe(true)

    const normalized = normalizeRiderLayerSettings([
      { id: "weather", visible: true, opacity: 2, order: 0 },
      { id: "weather", visible: false, opacity: 0.2, order: 7 },
      { id: "not-a-layer", visible: true, opacity: 0.8, order: 3 }
    ])

    expect(normalized.find((layer) => layer.id === "weather")).toMatchObject({
      visible: true,
      opacity: 1,
      order: 0
    })
    expect(normalized).toHaveLength(layerCatalog.length)
  })

  it("applies named map-pack overrides without dropping safety defaults", () => {
    const pack = applyRiderMapPack(defaultRiderLayerSettings(), {
      id: "weather-watch",
      name: "Weather watch",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      mapStyle: "night",
      routeVisibility: "high-contrast",
      layers: [{ id: "weather", visible: true, opacity: 0.75, order: 0 }]
    })

    expect(pack.mapStyle).toBe("night")
    expect(pack.routeVisibility).toBe("high-contrast")
    expect(pack.layers.find((layer) => layer.id === "weather")).toMatchObject({ visible: true, opacity: 0.75 })
    expect(pack.layers.find((layer) => layer.id === "curvature")).toBeDefined()
  })

  it("derives a complete, deterministic studio catalog from partial saved settings", () => {
    const settings = catalogLayerSettings([
      { id: "weather", visible: true, opacity: 0.7, order: 0 }
    ])

    expect(settings).toHaveLength(layerCatalog.length)
    expect(settings[0]).toMatchObject({
      definition: { id: "weather" },
      setting: { visible: true, opacity: 0.7, order: 0 }
    })
    expect(settings.find((entry) => entry.definition.id === "curvature"))
      .toMatchObject({ setting: { visible: false, opacity: 1 } })
  })
})
