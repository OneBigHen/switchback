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
    // The layer was always OSM signals and stops, never live congestion.
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
    // The old id is gone rather than lingering as a second, dead entry.
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
  it("migrates a pack saved before the premium wave", () => {
    expect(applyRiderMapPack([], pack({ mapStyle: "explorer" })))
      .toMatchObject({ experience: "terrain", lightPreference: "auto" })
    expect(applyRiderMapPack([], pack({ mapStyle: "night" })))
      .toMatchObject({ experience: "standard", lightPreference: "night" })
    expect(applyRiderMapPack([], pack({ mapStyle: "clean" })))
      .toMatchObject({ experience: "standard", lightPreference: "auto" })
  })

  it("prefers the premium fields when a newer pack has them", () => {
    const applied = applyRiderMapPack([], pack({
      mapStyle: "clean",
      experience: "satellite",
      lightPreference: "dusk"
    }))
    expect(applied).toMatchObject({ experience: "satellite", lightPreference: "dusk" })
  })

  it("ignores premium fields that are not valid values", () => {
    const applied = applyRiderMapPack([], pack({
      mapStyle: "explorer",
      experience: "hologram" as never,
      lightPreference: "strobe" as never
    }))
    expect(applied).toMatchObject({ experience: "terrain", lightPreference: "auto" })
  })

  it("carries a renamed layer choice through a saved pack", () => {
    const applied = applyRiderMapPack([], pack({
      layers: [{ id: "traffic" as never, visible: true, opacity: 0.5, order: 0 }]
    }))
    expect(applied.layers.find((layer) => layer.id === "road-controls")?.visible).toBe(true)
  })
})
