import { describe, expect, it } from "vitest"
import {
  applyRiderMapPack,
  layerCatalog,
  migrateRetiredBasemapLayer,
  migrateRiderLayerId,
  normalizeRiderLayerSettings,
  type RiderLayerId,
  type RiderMapPack
} from "@/lib/client/map-layers"

function pack(overrides: Partial<RiderMapPack> = {}): RiderMapPack {
  return {
    id: "pack-1",
    name: "Sunday roads",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    mapStyle: "clean",
    routeVisibility: "standard",
    layers: [],
    ...overrides
  }
}

describe("renamed rider layer ids", () => {
  it("migrates the old traffic id to road controls", () => {
    expect(migrateRiderLayerId("traffic")).toBe("road-controls")
    expect(migrateRiderLayerId("road-controls")).toBe("road-controls")
  })

  it("rejects an id that is not in the catalogue", () => {
    expect(migrateRiderLayerId("not-a-layer")).toBeNull()
  })

  it("preserves a saved traffic setting instead of resetting it", () => {
    const settings = normalizeRiderLayerSettings([
      { id: "traffic", visible: true, opacity: 0.4, order: 0 }
    ])
    const migrated = settings.find((layer) => layer.id === "road-controls")
    expect(migrated).toBeDefined()
    expect(migrated!.visible).toBe(true)
    expect(migrated!.opacity).toBe(0.4)
    expect(settings.some((layer) => (layer.id as string) === "traffic")).toBe(false)
  })

  it("does not let a stale traffic entry overwrite a current one", () => {
    const settings = normalizeRiderLayerSettings([
      { id: "road-controls", visible: true, opacity: 0.9, order: 0 },
      { id: "traffic", visible: false, opacity: 0.1, order: 1 }
    ])
    const migrated = settings.find((layer) => layer.id === "road-controls")!
    expect(migrated.visible).toBe(true)
    expect(migrated.opacity).toBe(0.9)
  })
})

describe("map pack migration", () => {
  it("migrates packs saved before the premium wave", () => {
    expect(applyRiderMapPack([], pack({ mapStyle: "explorer" })))
      .toMatchObject({ preset: "terrain", lightPreference: "auto" })
    expect(applyRiderMapPack([], pack({ mapStyle: "night" })))
      .toMatchObject({ preset: "road", lightPreference: "night" })
    expect(applyRiderMapPack([], pack({ mapStyle: "clean" })))
      .toMatchObject({ preset: "road", lightPreference: "auto" })
  })

  it("migrates premium-wave experience ids to canonical presets", () => {
    expect(applyRiderMapPack([], pack({ experience: "standard" })))
      .toMatchObject({ preset: "road", lightPreference: "auto" })
    expect(applyRiderMapPack([], pack({ experience: "terrain" })))
      .toMatchObject({ preset: "terrain", lightPreference: "auto" })
    expect(applyRiderMapPack([], pack({ experience: "satellite" })))
      .toMatchObject({ preset: "satellite", lightPreference: "auto" })
  })

  it("prefers a valid canonical preset over older rollback fields", () => {
    const applied = applyRiderMapPack([], pack({
      preset: "satellite",
      experience: "standard",
      mapStyle: "clean",
      lightPreference: "dusk"
    }))
    expect(applied).toMatchObject({ preset: "satellite", lightPreference: "dusk" })
  })

  it("falls through invalid newer fields instead of poisoning the row", () => {
    const premiumFallback = applyRiderMapPack([], pack({
      preset: "hologram" as never,
      experience: "terrain",
      mapStyle: "clean",
      lightPreference: "strobe" as never
    }))
    expect(premiumFallback).toMatchObject({ preset: "terrain", lightPreference: "auto" })

    const styleFallback = applyRiderMapPack([], pack({
      preset: "hologram" as never,
      experience: "warp" as never,
      mapStyle: "explorer"
    }))
    expect(styleFallback).toMatchObject({ preset: "terrain", lightPreference: "auto" })
  })

  it("uses a safe Road default when every stored presentation field is invalid", () => {
    const applied = applyRiderMapPack([], pack({
      preset: "hologram" as never,
      experience: "warp" as never,
      mapStyle: "unknown" as never
    }))
    expect(applied).toMatchObject({ preset: "road", lightPreference: "auto" })
  })

  it("carries a renamed layer choice through a saved pack", () => {
    const applied = applyRiderMapPack([], pack({
      layers: [{ id: "traffic" as never, visible: true, opacity: 0.5, order: 0 }]
    }))
    expect(applied.layers.find((layer) => layer.id === "road-controls")?.visible).toBe(true)
  })
})

describe("retired basemap layers", () => {
  it("no longer offers a basemap as an overlay", () => {
    // Terrain and Satellite existed both as a map preset and as a rider layer,
    // so the rider could choose the same idea twice from two controls that
    // meant two different renderers.
    for (const id of ["topo", "satellite", "terrain"]) {
      expect(layerCatalog.some((layer) => layer.id === id)).toBe(false)
      expect(migrateRiderLayerId(id)).toBeNull()
    }
  })

  it("turns a stored basemap layer back into the preset it meant", () => {
    expect(migrateRetiredBasemapLayer("satellite")).toBe("satellite")
    expect(migrateRetiredBasemapLayer("terrain")).toBe("terrain")
    expect(migrateRetiredBasemapLayer("topo")).toBe("terrain")
    expect(migrateRetiredBasemapLayer("curvature")).toBeNull()
  })

  it("recovers a rider's imagery choice from a pack that stored it as a layer", () => {
    const applied = applyRiderMapPack([], {
      id: "pack",
      name: "Imagery",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      preset: "road",
      mapStyle: "clean",
      lightPreference: "auto",
      routeVisibility: "standard",
      layers: [{ id: "satellite" as RiderLayerId, visible: true, opacity: 1, order: 0 }]
    })
    expect(applied.preset).toBe("satellite")
    expect(applied.layers.some((layer) => String(layer.id) === "satellite")).toBe(false)
  })

  it("leaves an explicit non-road preset alone", () => {
    const applied = applyRiderMapPack([], {
      id: "pack",
      name: "Terrain with old imagery layer",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      preset: "terrain",
      mapStyle: "explorer",
      lightPreference: "night",
      routeVisibility: "standard",
      layers: [{ id: "topo" as RiderLayerId, visible: true, opacity: 1, order: 0 }]
    })
    expect(applied.preset).toBe("terrain")
  })
})
