import { describe, expect, it } from "vitest"
import {
  classifyCatalogArea,
  cleanCatalogRouteName,
  knownDurationMinutes
} from "@/lib/gpx/catalog-presentation"

describe("catalog presentation truth", () => {
  it("removes import ordering and source-site boilerplate without inventing a new name", () => {
    expect(cleanCatalogRouteName("000 Armstrong County Loops - created by 54warrior on ADVHub.net"))
      .toBe("Armstrong County Loops")
    expect(cleanCatalogRouteName("  Pine   Creek connector.gpx  ")).toBe("Pine Creek connector")
    expect(cleanCatalogRouteName("Bald Eagle Dual Sport")).toBe("Bald Eagle Dual Sport")
  })

  it("keeps unknown or invalid imported durations unknown instead of turning them into zero minutes", () => {
    expect(knownDurationMinutes(0)).toBeNull()
    expect(knownDurationMinutes(-12)).toBeNull()
    expect(knownDurationMinutes(Number.NaN)).toBeNull()
    expect(knownDurationMinutes(Number.POSITIVE_INFINITY)).toBeNull()
    expect(knownDurationMinutes("91")).toBeNull()
    expect(knownDurationMinutes(null)).toBeNull()
    expect(knownDurationMinutes(91)).toBe(91)
  })

  it("files a Bald Eagle route using its real bbox instead of name inference", () => {
    expect(classifyCatalogArea([-77.9, 40.75, -77.25, 41.1])).toEqual({
      region: "North-Central PA",
      ridingAreas: ["PA Wilds", "Bald Eagle / Rothrock"]
    })
  })

  it("files riding areas by the route centre, never by a far-reaching bbox edge", () => {
    // Centre (-78.1, 41.575) sits in PA Wilds; the bbox merely clips Pine Creek
    // and the Allegheny National Forest, which the route is not filed under.
    const area = classifyCatalogArea([-79.05, 41.2, -77.15, 41.95])
    expect(area.region).toBe("North-Central PA")
    expect(area.ridingAreas).toEqual(["PA Wilds"])
  })

  it("does not stretch PA Wilds south into Armstrong County", () => {
    // Real catalog route "Armstrong County Loops": centre about (-79.47, 40.81).
    expect(classifyCatalogArea([-79.8, 40.6, -79.15, 41.02])).toEqual({
      region: "Southwest PA",
      ridingAreas: []
    })
  })

  it("does not misfile nearby New Jersey as Pennsylvania", () => {
    expect(classifyCatalogArea([-74.95, 40.15, -74.55, 40.55])).toEqual({
      region: "New Jersey",
      ridingAreas: []
    })
  })

  it("keeps recognizable non-PA regions and an honest farther-afield bucket", () => {
    expect(classifyCatalogArea([-81.2, 40.0, -80.8, 40.4]).region).toBe("Ohio")
    expect(classifyCatalogArea([-122.5, 37.6, -122.3, 37.9])).toEqual({
      region: "Farther afield",
      ridingAreas: []
    })
  })

  it("keeps routes without a bbox explicitly unplaced", () => {
    expect(classifyCatalogArea(null)).toEqual({ region: null, ridingAreas: [] })
    expect(classifyCatalogArea(undefined)).toEqual({ region: null, ridingAreas: [] })
  })
})
