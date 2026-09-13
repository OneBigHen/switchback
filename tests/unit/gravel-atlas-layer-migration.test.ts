import { describe, expect, it } from "vitest"
import {
  layerCatalog,
  migrateRiderLayerId,
  normalizeRiderLayerSettings
} from "@/lib/client/map-layers"

describe("Gravel Atlas layer migration", () => {
  it("exposes one canonical road-surface overlay", () => {
    expect(
      layerCatalog
        .filter((layer) => layer.dataCategory === "road-surface")
        .map((layer) => layer.id)
    ).toEqual(["gravel-atlas"])
  })

  it("migrates the legacy unpaved layer id to Gravel Atlas", () => {
    expect(migrateRiderLayerId("unpaved")).toBe("gravel-atlas")
  })

  it("preserves a saved legacy layer choice while migrating it", () => {
    const settings = normalizeRiderLayerSettings([
      { id: "unpaved", visible: true, opacity: 0.42, order: 3 }
    ])
    const atlas = settings.find((setting) => setting.id === "gravel-atlas")

    expect(settings.some((setting) => setting.id === "unpaved")).toBe(false)
    expect(atlas).toMatchObject({ visible: true, opacity: 0.42 })
  })
})
