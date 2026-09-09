import { describe, expect, it } from "vitest"
import { classifyRouteGeography } from "@/lib/gpx/route-regions"

describe("classifyRouteGeography", () => {
  it("files a Bald Eagle route under North-Central PA and its rider-facing area", () => {
    const geography = classifyRouteGeography([-77.9, 40.75, -77.25, 41.1])

    expect(geography.macroRegion).toBe("North-Central PA")
    expect(geography.ridingAreas).toContain("Bald Eagle / Rothrock")
  })

  it("lets a long route belong to more than one recognizable riding area", () => {
    const geography = classifyRouteGeography([-79.05, 41.2, -77.15, 41.95])

    expect(geography.macroRegion).toBe("North-Central PA")
    expect(geography.ridingAreas).toContain("PA Wilds")
    expect(geography.ridingAreas).toContain("Pine Creek")
  })

  it("keeps non-PA routes browseable without pretending they are Pennsylvania", () => {
    const geography = classifyRouteGeography([-74.95, 40.15, -74.55, 40.55])

    expect(geography.macroRegion).toBe("New Jersey")
    expect(geography.ridingAreas).toEqual([])
  })

  it("returns an honest unplaced state when no bbox exists", () => {
    expect(classifyRouteGeography(null)).toEqual({
      macroRegion: null,
      ridingAreas: []
    })
  })
})
