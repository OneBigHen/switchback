import { describe, expect, it } from "vitest"
import { riderFeatureUnavailableLayerIds } from "@/lib/client/rider-feature-availability"

describe("riderFeatureUnavailableLayerIds", () => {
  it("maps a TomTom outage only to the live traffic layer", () => {
    expect(riderFeatureUnavailableLayerIds(
      ["traffic"],
      ["fuel", "live-traffic", "weather"]
    )).toEqual(["live-traffic"])
  })

  it("maps provider outages without marking unrelated successful layers failed", () => {
    expect(riderFeatureUnavailableLayerIds(
      ["osm", "weather"],
      ["fuel", "repair", "weather", "live-traffic"]
    )).toEqual(["fuel", "repair", "weather"])
  })

  it("maps a Gravel Atlas outage only to the Known gravel roads layer, never to OSM layers", () => {
    expect(riderFeatureUnavailableLayerIds(
      ["gravel-atlas"],
      ["fuel", "gravel-atlas", "live-traffic"]
    )).toEqual(["gravel-atlas"])
    expect(riderFeatureUnavailableLayerIds(
      ["osm"],
      ["fuel", "gravel-atlas"]
    )).toEqual(["fuel"])
  })

  it("ignores unavailable providers for layers that were not requested", () => {
    expect(riderFeatureUnavailableLayerIds(
      ["traffic"],
      ["fuel"]
    )).toEqual([])
  })
})
