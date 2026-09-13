import { describe, expect, it } from "vitest"
import {
  applyRiderMapPack,
  catalogLayerSettings,
  defaultRiderLayerSettings,
  layerCatalog,
  mapStyleUrl,
  mapLayerRuntime,
  migrateRiderLayerId,
  normalizeRiderLayerSettings,
  paUnpavedRoadsQuery,
  shouldShowBaseMapFailure
} from "@/lib/client/map-layers"
import { PA_UNPAVED_ROADS_MIN_ZOOM } from "@/lib/roads/types"

describe("map layer settings", () => {
  it("maps rider-friendly style names to OpenFreeMap styles", () => {
    expect(mapStyleUrl("clean")).toMatch(/positron$/)
    expect(mapStyleUrl("explorer")).toMatch(/liberty$/)
    expect(mapStyleUrl("night")).toMatch(/fiord$/)
  })

  it("builds a bounded legacy PA unpaved-road viewport query only at useful zoom", () => {
    expect(paUnpavedRoadsQuery({ west: -77.2, south: 40.1, east: -76.6, north: 40.6 }, 6)).toBeNull()
    expect(paUnpavedRoadsQuery({ west: -77.2, south: 40.1, east: -76.6, north: 40.6 }, 9))
      .toBe("bbox=-77.2%2C40.1%2C-76.6%2C40.6&zoom=9&limit=500")
    expect(paUnpavedRoadsQuery({ west: -77.2, south: 40.1, east: -76.6, north: 40.6 }, 10))
      .toBe("bbox=-77.2%2C40.1%2C-76.6%2C40.6&zoom=10&limit=500")
    expect(paUnpavedRoadsQuery({ west: -80, south: 38, east: -72, north: 43 }, 10)).toBeNull()
  })

  it("keeps the retired PASDA API bounded without re-exposing it as a current layer", () => {
    const bounds = { west: -77.2, south: 40.1, east: -76.6, north: 40.6 }
    for (const zoom of [7, 8]) {
      expect(paUnpavedRoadsQuery(bounds, zoom)).toBeNull()
    }
    expect(paUnpavedRoadsQuery(bounds, PA_UNPAVED_ROADS_MIN_ZOOM)).not.toBeNull()
    expect(layerCatalog.some((layer) => layer.id === "unpaved")).toBe(false)
    expect(migrateRiderLayerId("unpaved")).toBe("gravel-atlas")
    expect(layerCatalog.find((layer) => layer.id === "gravel-atlas")?.minZoom).toBe(8)
  })

  it("ignores recoverable tile errors after the initial style has rendered", () => {
    expect(shouldShowBaseMapFailure(false, false)).toBe(true)
    expect(shouldShowBaseMapFailure(true, false)).toBe(false)
    expect(shouldShowBaseMapFailure(true, true)).toBe(false)
  })

  it("ships one canonical Gravel Atlas surface layer with provenance and safely normalizes saved settings", () => {
    const gravelAtlas = layerCatalog.find((layer) => layer.id === "gravel-atlas")
    expect(layerCatalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "curvature", source: expect.stringMatching(/OpenGravel/i) }),
      expect.objectContaining({ id: "weather", freshness: expect.any(String) }),
      expect.objectContaining({ id: "fuel", coverage: expect.any(String) }),
      expect.objectContaining({ id: "mvum", status: "live" })
    ]))
    expect(layerCatalog.filter((layer) => layer.dataCategory === "road-surface")).toHaveLength(1)
    expect(gravelAtlas).toMatchObject({
      source: "OpenGravel Gravel Atlas",
      provenance: expect.stringMatching(/graph-verified.*official source snapshots/i),
      legend: expect.stringMatching(/known gravel corridor/i)
    })
    expect(gravelAtlas?.provenance).toMatch(/not a guarantee of legal access/i)
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

    expect(pack.preset).toBe("road")
    expect(pack.lightPreference).toBe("night")
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
