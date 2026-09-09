import { describe, expect, it } from "vitest"
import {
  MAP_PRESETS,
  availableMapPresets,
  isMapPresetId,
  mapPresetDefinition
} from "@/lib/client/map-preset-registry"

describe("canonical map preset registry", () => {
  it("owns the exact rider-facing preset order and labels", () => {
    expect(MAP_PRESETS.map((preset) => preset.id)).toEqual(["road", "terrain", "satellite"])
    expect(MAP_PRESETS.map((preset) => preset.label)).toEqual(["Road", "Terrain", "Satellite"])
    expect(MAP_PRESETS.map((preset) => String(preset.label))).not.toContain("Standard")
  })

  it("declares style family and premium capability in one place", () => {
    expect(mapPresetDefinition("road")).toMatchObject({
      styleFamily: "standard",
      requiresPremiumRenderer: false
    })
    expect(mapPresetDefinition("terrain")).toMatchObject({
      styleFamily: "standard",
      requiresPremiumRenderer: false
    })
    expect(mapPresetDefinition("satellite")).toMatchObject({
      styleFamily: "standard-satellite",
      requiresPremiumRenderer: true
    })
  })

  it("filters only presets the active renderer can draw", () => {
    expect(availableMapPresets({ premiumRenderer: false }).map((preset) => preset.id))
      .toEqual(["road", "terrain"])
    expect(availableMapPresets({ premiumRenderer: true }).map((preset) => preset.id))
      .toEqual(["road", "terrain", "satellite"])
  })

  it("treats old and future vocabulary as non-canonical input", () => {
    expect(isMapPresetId("road")).toBe(true)
    expect(isMapPresetId("terrain")).toBe(true)
    expect(isMapPresetId("satellite")).toBe(true)
    expect(isMapPresetId("standard")).toBe(false)
    expect(isMapPresetId("topo")).toBe(false)
    expect(isMapPresetId("hologram")).toBe(false)
    expect(isMapPresetId(undefined)).toBe(false)
  })
})
