import { describe, expect, it } from "vitest"
import {
  applyRiderMapPack,
  migrateRiderLayerId,
  normalizeRiderLayerSettings,
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
