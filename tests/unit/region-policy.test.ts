import { describe, expect, it } from "vitest"
import {
  REGION_POLICY_OVERLAYS,
  getRegionPolicyOverlay
} from "@/lib/routing/region-policy"

describe("region policy overlays", () => {
  it("defines overlays for PA, WV, NJ, NY", () => {
    const ids = REGION_POLICY_OVERLAYS.map((overlay) => overlay.regionId)
    expect(ids).toEqual(["pennsylvania", "west-virginia", "new-jersey", "new-york"])
  })

  it("PA overlay rewards curvy secondary roads and emphasizes elevation", () => {
    const pa = getRegionPolicyOverlay("pennsylvania")!
    expect(pa.customModel.rewardCurvySecondary).toBe(true)
    expect(pa.customModel.emphasizeElevationAndRemoteness).toBe(true)
    expect(pa.customModel.penalizeUncertainSurface).toBe(true)
  })

  it("NJ overlay avoids unsuitable parkway segments and penalizes dense urban routing", () => {
    const nj = getRegionPolicyOverlay("new-jersey")!
    expect(nj.customModel.avoidUnsuitableParkways).toBe(true)
    expect(nj.customModel.penalizeDenseUrban).toBe(true)
  })

  it("NY overlay models seasonal mountain closures and fuel gaps", () => {
    const ny = getRegionPolicyOverlay("new-york")!
    expect(ny.customModel.modelSeasonalMountainClosures).toBe(true)
    expect(ny.customModel.fuelGapMiles).toBeGreaterThan(60)
  })

  it("WV overlay carries a longer fuel gap than NJ", () => {
    const wv = getRegionPolicyOverlay("west-virginia")!
    const nj = getRegionPolicyOverlay("new-jersey")!
    expect(wv.customModel.fuelGapMiles!).toBeGreaterThan(nj.customModel.fuelGapMiles!)
  })

  it("returns undefined for regions without a policy overlay", () => {
    expect(getRegionPolicyOverlay("delaware")).toBeUndefined()
  })
})
