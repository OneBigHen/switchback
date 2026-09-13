import { describe, expect, it } from "vitest"
import {
  defaultRiderLayerSettings,
  featureMapLayerIds,
  layerCatalog,
  mapLayerRuntime,
  migrateRiderLayerId
} from "@/lib/client/map-layers"

describe("live traffic rider layer", () => {
  it("registers live traffic as a feature-backed conditions layer", () => {
    const definition = layerCatalog.find((layer) => layer.id === "live-traffic")

    expect(definition).toMatchObject({
      id: "live-traffic",
      name: "Live traffic",
      category: "conditions",
      status: "live",
      dataCategory: "conditions-traffic"
    })
    expect(definition?.source).toContain("TomTom")
    expect(featureMapLayerIds).toContain("live-traffic")
    expect(mapLayerRuntime("live-traffic")).toEqual({ kind: "features" })
  })

  it("keeps live traffic opt-in instead of turning it on for every rider", () => {
    expect(defaultRiderLayerSettings().find((layer) => layer.id === "live-traffic")).toMatchObject({
      visible: false,
      opacity: 1
    })
  })

  it("keeps the legacy traffic migration pointed at road controls, not live traffic", () => {
    expect(migrateRiderLayerId("traffic")).toBe("road-controls")
  })
})
