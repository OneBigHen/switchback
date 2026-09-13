import { describe, expect, it } from "vitest"
import { defaultRideIntent, type RideIntent } from "@/lib/domain/ride-intent"
import { buildCanonicalRideRequest } from "@/lib/planner/canonical-ride-request"
import {
  defaultRiderLayerSettings,
  layerCatalog,
  riderFeatureQuery,
  type RiderLayerSetting
} from "@/lib/client/map-layers"

const gravelPreference = { enabled: true, intensity: "more" as const }

describe("Gravel Atlas rider controls", () => {
  it("keeps the routing preference in canonical ride intent and defaults it off", () => {
    const preference = (defaultRideIntent() as unknown as {
      gravelAtlas?: { enabled: boolean; intensity: string }
    }).gravelAtlas

    expect(preference).toEqual({ enabled: false, intensity: "balanced" })
  })

  it("carries an enabled Gravel Atlas preference through the canonical route request", () => {
    const base = defaultRideIntent()
    const intent = {
      ...base,
      start: { lat: 40.1779, lon: -75.1066, label: "Hatboro" },
      finish: { lat: 40.3643, lon: -74.9513, label: "New Hope" },
      profile: "adventure",
      gravelAtlas: gravelPreference
    } as unknown as RideIntent

    const request = buildCanonicalRideRequest(intent, { seed: 18, planningId: "gravel-controls" })

    expect(request.gravelAtlas).toEqual(gravelPreference)
  })

  it("offers Known gravel roads as an independent, off-by-default viewport layer", () => {
    const definition = layerCatalog.find((layer) => layer.id === ("gravel-atlas" as never))
    expect(definition).toMatchObject({
      id: "gravel-atlas",
      name: "Known gravel roads",
      category: "roads",
      dataCategory: "road-surface"
    })

    const setting = defaultRiderLayerSettings().find((layer) => layer.id === ("gravel-atlas" as never))
    expect(setting).toMatchObject({ visible: false, opacity: 1 })
  })

  it("describes only the activated New Jersey coverage while Pennsylvania stays gated", () => {
    const definition = layerCatalog.find((layer) => layer.id === ("gravel-atlas" as never))
    expect(definition?.coverage).toMatch(/New Jersey/)
    expect(definition?.coverage).not.toMatch(/Pennsylvania/)
  })

  it("loads Known gravel roads through the same bounded viewport query used by rider layers", () => {
    const settings = [{
      id: "gravel-atlas",
      visible: true,
      opacity: 1,
      order: 0
    }] as unknown as RiderLayerSetting[]

    const query = riderFeatureQuery(settings, {
      west: -75.4,
      south: 39.9,
      east: -74.7,
      north: 40.5
    }, 10)

    expect(query).not.toBeNull()
    expect(new URLSearchParams(query ?? "").get("layers")).toBe("gravel-atlas")
  })
})
