import { describe, expect, it } from "vitest"
import {
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
})
