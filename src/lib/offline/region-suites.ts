import type { OfflineRegion } from "@/lib/offline/region-catalog"
import { OFFLINE_REGIONS } from "@/lib/offline/region-catalog"

/**
 * Region selection presets. A suite is a *selection preset* (`Home
 * Territory`, `Appalachia`, `Northeast`), never a separate downloadable
 * file. Selecting a suite checks several independent region packages,
 * and each region remains independently downloadable, updateable,
 * removable, and versioned. Pennsylvania is stored once, not duplicated
 * inside several bundles.
 */
export interface RegionSuite {
  id: string
  label: string
  description: string
  regionCodes: readonly string[]
}

export const REGION_SUITES: readonly RegionSuite[] = [
  {
    id: "home-territory",
    label: "Home Territory",
    description: "Pennsylvania, New Jersey, New York, Maryland, West Virginia, and Delaware. The default recommendation.",
    regionCodes: ["PA", "NJ", "NY", "MD", "WV", "DE"]
  },
  {
    id: "appalachia",
    label: "Appalachia",
    description: "Twisties and forest roads across Pennsylvania, West Virginia, Virginia, North Carolina, and Ohio.",
    regionCodes: ["PA", "WV", "VA", "NC", "OH"]
  },
  {
    id: "northeast",
    label: "Northeast",
    description: "Pennsylvania, New Jersey, New York, Vermont, Maryland, and Delaware.",
    regionCodes: ["PA", "NJ", "NY", "VT", "MD", "DE"]
  }
] as const

export const HOME_TERRITORY_SUITE_ID = "home-territory" as const

export const HOME_TERRITORY_REGION_CODES: readonly string[] = REGION_SUITES[0]!.regionCodes

export function getRegionSuite(id: string): RegionSuite | undefined {
  return REGION_SUITES.find((suite) => suite.id === id)
}

/**
 * Resolve a suite's codes into catalog entries. Unknown codes are
 * skipped so a suite can advertise a region that is not yet published
 * without breaking the picker.
 */
export function resolveSuiteRegions(suite: RegionSuite): OfflineRegion[] {
  const codes = new Set(suite.regionCodes)
  return OFFLINE_REGIONS.filter((region) => codes.has(region.code))
}

/**
 * Return catalog entries for a list of region codes. Used by the
 * storage-quota estimator to project the bytes a suite selection would
 * occupy once installed.
 */
export function resolveRegionsByCode(codes: readonly string[]): OfflineRegion[] {
  const set = new Set(codes)
  return OFFLINE_REGIONS.filter((region) => set.has(region.code))
}
