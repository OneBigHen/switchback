import type { OfflineRegion } from "@/lib/offline/region-catalog"

/**
 * Region policy overlay. Each overlay is a *tuning* on GraphHopper's
 * custom model — it speeds, rewards, or penalizes specific highway
 * classes, surfaces, or features for that state. There is one universal
 * motorcycle graph schema; overlays are data, not separate codebases.
 *
 * Per-region guidance mirrors the lead decision:
 *
 * - PA / WV: reward curvy secondary roads, use forest roads for
 *   Adventure and Dual-Sport, penalize uncertain surface quality, and
 *   emphasize elevation and remoteness.
 * - NJ: respect motorcycle and limited-access restrictions, penalize
 *   dense urban routing when a comparable rural alternative exists,
 *   and avoid unsuitable parkway segments.
 * - NY: model mountain and seasonal roads, account for longer fuel
 *   gaps, and distinguish maintained gravel from poor tracks.
 */
export interface RegionPolicyOverlay {
  regionId: string
  /** Short summary shown in the region card. */
  summary: string
  /** GraphHopper custom-model multipliers the router applies. */
  customModel: {
    /** Multiplier applied to the base speed on these highway classes. */
    speedMultipliers?: Record<string, number>
    /** Penalty (0 inclusive, 1 exclusive) applied to these highway classes. */
    priorityMultipliers?: Record<string, number>
    /** Highway classes that should be excluded entirely for the default profile. */
    excludeHighwayClasses?: string[]
    /** Surfaces that should be excluded for street/touring profiles. */
    excludeSurfaces?: string[]
    /** Whether to reward curvy secondary roads. */
    rewardCurvySecondary?: boolean
    /** Whether to penalize uncertain surface quality. */
    penalizeUncertainSurface?: boolean
    /** Whether to emphasize elevation and remoteness for adventure routing. */
    emphasizeElevationAndRemoteness?: boolean
    /** Whether to avoid unsuitable parkway segments (e.g. NJ parkways). */
    avoidUnsuitableParkways?: boolean
    /** Whether to penalize dense urban routing when rural alternatives exist. */
    penalizeDenseUrban?: boolean
    /** Whether to model seasonal mountain closures explicitly. */
    modelSeasonalMountainClosures?: boolean
    /** Recommended fuel-gap distance in miles between reliable refuel points. */
    fuelGapMiles?: number
  }
  /** Notes surfaced to the rider on the region card. */
  notes?: string[]
}

export const REGION_POLICY_OVERLAYS: readonly RegionPolicyOverlay[] = [
  {
    regionId: "pennsylvania",
    summary: "Reward curvy secondary roads; forest-road use for Adventure and Dual-Sport; penalize uncertain surfaces.",
    customModel: {
      priorityMultipliers: { secondary: 1, tertiary: 0.96, track: 0.75 },
      rewardCurvySecondary: true,
      penalizeUncertainSurface: true,
      emphasizeElevationAndRemoteness: true,
      fuelGapMiles: 80
    },
    notes: [
      "PA forest roads are available for Adventure and Dual-Sport profiles when explicitly permitted.",
      "Surface quality is uncertain on many remote segments; the route explanation will name these."
    ]
  },
  {
    regionId: "west-virginia",
    summary: "Reward curvy secondary roads; forest-road use for Adventure and Dual-Sport; emphasize elevation and remoteness.",
    customModel: {
      priorityMultipliers: { secondary: 1, tertiary: 0.92, track: 0.76 },
      rewardCurvySecondary: true,
      penalizeUncertainSurface: true,
      emphasizeElevationAndRemoteness: true,
      fuelGapMiles: 100
    },
    notes: [
      "WV has longer fuel gaps between remote services; the Adventure profile plans fuel stops accordingly."
    ]
  },
  {
    regionId: "new-jersey",
    summary: "Respect motorcycle and limited-access restrictions; penalize dense urban routing; avoid unsuitable parkway segments.",
    customModel: {
      speedMultipliers: { residential: 0.9, living_street: 0.85 },
      priorityMultipliers: { motorway: 0.6, trunk: 0.85, residential: 0.7 },
      avoidUnsuitableParkways: true,
      penalizeDenseUrban: true,
      fuelGapMiles: 60
    },
    notes: [
      "Restricted parkway segments are excluded by the motorcycle access normalization step before graph import.",
      "Urban alternatives are penalized when a comparable rural route exists within the same profile."
    ]
  },
  {
    regionId: "new-york",
    summary: "Model mountain and seasonal roads; account for longer fuel gaps; distinguish maintained gravel from poor tracks.",
    customModel: {
      priorityMultipliers: { secondary: 1, tertiary: 0.96, track: 0.74 },
      modelSeasonalMountainClosures: true,
      penalizeUncertainSurface: true,
      fuelGapMiles: 90
    },
    notes: [
      "Adirondack and Catskill seasonal closures are loaded as time-windowed closures on the graph.",
      "Maintained gravel is permitted for Adventure; poor tracks remain subject to bike-profile filtering."
    ]
  }
] as const

export function getRegionPolicyOverlay(regionId: string): RegionPolicyOverlay | undefined {
  return REGION_POLICY_OVERLAYS.find((overlay) => overlay.regionId === regionId)
}

export function getRegionPolicyOverlayByCatalog(region: OfflineRegion): RegionPolicyOverlay | undefined {
  return getRegionPolicyOverlay(region.id)
}
