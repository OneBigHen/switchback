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
      ridingArea: "Bald Eagle / Rothrock"
    })
  })

  it("does not misfile nearby New Jersey as Pennsylvania", () => {
    expect(classifyCatalogArea([-74.95, 40.15, -74.55, 40.55])).toEqual({
      region: "New Jersey",
      ridingArea: null
    })
  })

  it("keeps routes without a bbox explicitly unplaced", () => {
    expect(classifyCatalogArea(null)).toEqual({ region: null, ridingArea: null })
  })
})
