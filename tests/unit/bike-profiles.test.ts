import { describe, expect, it } from "vitest"
import {
  MOTORCYCLE_PROFILES,
  getBikeProfile,
  listBikeProfiles,
  disallowedSurfaces,
  disallowedSmoothness,
  disallowedTracktypes
} from "@/lib/routing/bike-profiles"

describe("motorcycle bike profiles", () => {
  it("defines Street, Touring, Adventure, and Dual-Sport presets", () => {
    const names = MOTORCYCLE_PROFILES.map((profile) => profile.name)
    expect(names).toEqual(["Street", "Touring", "Adventure", "Dual-Sport"])
  })

  it("returns a copy from listBikeProfiles", () => {
    const a = listBikeProfiles()
    const b = listBikeProfiles()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it("getBikeProfile is case-insensitive", () => {
    expect(getBikeProfile("STREET")?.category).toBe("street")
    expect(getBikeProfile("dual-sport")?.category).toBe("dual-sport")
    expect(getBikeProfile("nonexistent")).toBeUndefined()
  })

  it("street profile refuses unknown surfaces and dirt", () => {
    const street = getBikeProfile("Street")!
    expect(street.allowMaintainedGravel).toBe(false)
    expect(street.avoidUnknownSurface).toBe(true)
    const disallowed = disallowedSurfaces(street)
    expect(disallowed.has("dirt")).toBe(true)
    expect(disallowed.has("gravel")).toBe(true)
    expect(disallowed.has("asphalt")).toBe(false)
  })

  it("adventure profile permits maintained gravel but forbids impassable smoothness", () => {
    const adventure = getBikeProfile("Adventure")!
    expect(adventure.allowMaintainedGravel).toBe(true)
    expect(adventure.allowRoughTracks).toBe(false)
    const disallowed = disallowedSmoothness(adventure)
    expect(disallowed.has("impassable")).toBe(true)
    expect(disallowed.has("bad")).toBe(false)
  })

  it("dual-sport profile forbids only grade5 tracks", () => {
    const dual = getBikeProfile("Dual-Sport")!
    expect(dual.allowRoughTracks).toBe(true)
    const disallowed = disallowedTracktypes(dual)
    expect(disallowed.size).toBe(0)
  })

  it("touring profile has the longest fuel range", () => {
    const touring = getBikeProfile("Touring")!
    const street = getBikeProfile("Street")!
    expect(touring.fuelRangeMiles).toBeGreaterThan(street.fuelRangeMiles)
  })
})
