import { describe, expect, it } from "vitest"
import {
  REGION_SUITES,
  HOME_TERRITORY_REGION_CODES,
  HOME_TERRITORY_SUITE_ID,
  getRegionSuite,
  resolveSuiteRegions,
  resolveRegionsByCode
} from "@/lib/offline/region-suites"
import { OFFLINE_REGIONS } from "@/lib/offline/region-catalog"

describe("region suites", () => {
  it("defines Home Territory, Appalachia, and Northeast presets", () => {
    const ids = REGION_SUITES.map((s) => s.id)
    expect(ids).toEqual(["home-territory", "appalachia", "northeast"])
    expect(HOME_TERRITORY_SUITE_ID).toBe("home-territory")
  })

  it("Home Territory contains PA, NJ, NY, MD, WV, DE", () => {
    expect(HOME_TERRITORY_REGION_CODES).toEqual(["PA", "NJ", "NY", "MD", "WV", "DE"])
  })

  it("Appalachia contains PA, WV, VA, NC, OH", () => {
    const appalachia = getRegionSuite("appalachia")!
    expect(appalachia.regionCodes).toEqual(["PA", "WV", "VA", "NC", "OH"])
  })

  it("Northeast includes Vermont", () => {
    const northeast = getRegionSuite("northeast")!
    expect(northeast.regionCodes).toContain("VT")
  })

  it("suites never duplicate data — each region is one package", () => {
    const home = resolveSuiteRegions(getRegionSuite("home-territory")!)
    expect(home).toHaveLength(6)
    // Each region appears exactly once in the catalog and exactly once in any suite.
    for (const region of home) {
      const occurrences = OFFLINE_REGIONS.filter((r) => r.id === region.id).length
      expect(occurrences).toBe(1)
    }
  })

  it("resolveRegionsByCode tolerates unknown codes", () => {
    const resolved = resolveRegionsByCode(["PA", "XX"])
    expect(resolved.map((r) => r.code)).toEqual(["PA"])
  })
})
