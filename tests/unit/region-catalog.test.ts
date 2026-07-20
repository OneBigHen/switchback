import { describe, expect, it } from "vitest"
import {
  OFFLINE_REGIONS,
  getRegionById,
  findRegionsContaining,
  suggestRegionsForRoute,
  formatRegionBytes
} from "@/lib/offline/region-catalog"

describe("region catalog", () => {
  it("defines at least 8 US regions", () => {
    expect(OFFLINE_REGIONS.length).toBeGreaterThanOrEqual(8)
  })

  it("each region has a unique id and a valid tile URL", () => {
    const ids = OFFLINE_REGIONS.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const region of OFFLINE_REGIONS) {
      expect(region.tileUrl).toMatch(/^\/api\/offline\/regions\/.+/)
      expect(region.id.length).toBeGreaterThan(0)
      expect(region.code.length).toBeGreaterThanOrEqual(2)
      expect(region.estimatedDownloadBytes).toBeGreaterThan(0)
      expect(region.estimatedNodeCount).toBeGreaterThan(0)
    }
  })

  it("getRegionById finds a known region", () => {
    const pa = getRegionById("pennsylvania")
    expect(pa).toBeDefined()
    expect(pa!.code).toBe("PA")
  })

  it("getRegionById returns undefined for unknown regions", () => {
    expect(getRegionById("atlantis")).toBeUndefined()
  })

  it("findRegionsContaining returns PA for Harrisburg", () => {
    const regions = findRegionsContaining([-76.8867, 40.2732])
    expect(regions.some((r) => r.id === "pennsylvania")).toBe(true)
  })

  it("suggestRegionsForRoute ranks regions by waypoint coverage", () => {
    const suggested = suggestRegionsForRoute([
      [-76.8867, 40.2732], // Harrisburg PA
      [-74.95, 40.2]       // near Trenton NJ
    ])
    expect(suggested[0]!.id).toBe("pennsylvania")
    const nj = suggested.find((r) => r.id === "new-jersey")
    expect(nj).toBeDefined()
  })

  it("formatRegionBytes formats correctly", () => {
    expect(formatRegionBytes(0)).toBe("0 B")
    expect(formatRegionBytes(500)).toBe("500 B")
    expect(formatRegionBytes(2_000)).toBe("2 KB")
    expect(formatRegionBytes(1_500_000)).toBe("2 MB")
    expect(formatRegionBytes(1_200_000_000)).toBe("1.2 GB")
  })
})
