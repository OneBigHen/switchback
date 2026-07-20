/**
 * Map staleness tiers (age in days) to the rider-facing behaviour the
 * lead decision mandates._routing is never blocked based on age alone —
 * an older map is usually more useful than no offline route.
 *
 *   0–30 days    Current      normal behaviour
 *   31–60 days   Aging        small informational badge
 *   61–90 days   Stale        warning and update recommendation
 *   >90 days     Very stale   strong warning before an offline ride
 *   schema mismatch  Unsupported  require rebuild or redownload
 */
export type RegionStalenessTier = "current" | "aging" | "stale" | "very-stale" | "unsupported"

export interface RegionStalenessResult {
  tier: RegionStalenessTier
  ageDays: number
  /** Short label for a region card. */
  label: string
  /** Long-form guidance for the rider. */
  guidance: string
  /** True when the app should let routing proceed with this bundle. */
  routable: boolean
  /** True when an update should be offered before an offline ride. */
  recommendUpdate: boolean
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export const STALENESS_THRESHOLDS = Object.freeze({
  currentMaxDays: 30,
  agingMaxDays: 60,
  staleMaxDays: 90
})

/** Compute the staleness tier for a bundle built at `builtAt` against `now`. */
export function evaluateRegionStaleness(
  builtAt: string | null,
  options: { now?: Date; schemaCompatible?: boolean } = {}
): RegionStalenessResult {
  if (options.schemaCompatible === false) {
    return {
      tier: "unsupported",
      ageDays: Number.POSITIVE_INFINITY,
      label: "Unsupported",
      guidance:
        "This map bundle was built with an incompatible graph schema. Rebuild or redownload the region before relying on it.",
      routable: false,
      recommendUpdate: true
    }
  }
  if (!builtAt) {
    return {
      tier: "very-stale",
      ageDays: Number.POSITIVE_INFINITY,
      label: "Unknown age",
      guidance: "No build timestamp is recorded. Treat this bundle as out of date; download a fresh copy before a trip.",
      routable: false,
      recommendUpdate: true
    }
  }
  const builtMs = Date.parse(builtAt)
  if (!Number.isFinite(builtMs)) {
    return {
      tier: "very-stale",
      ageDays: Number.POSITIVE_INFINITY,
      label: "Unknown age",
      guidance: "The bundle's build timestamp could not be parsed. Redownload to refresh staleness.",
      routable: false,
      recommendUpdate: true
    }
  }
  const now = options.now ?? new Date()
  const ageDays = Math.max(0, Math.floor((now.getTime() - builtMs) / ONE_DAY_MS))

  if (ageDays <= STALENESS_THRESHOLDS.currentMaxDays) {
    return {
      tier: "current",
      ageDays,
      label: "Current",
      guidance: "Map data is fresh.",
      routable: true,
      recommendUpdate: false
    }
  }
  if (ageDays <= STALENESS_THRESHOLDS.agingMaxDays) {
    return {
      tier: "aging",
      ageDays,
      label: "Aging",
      guidance: `Map data is ${ageDays} days old. Consider refreshing before your next trip.`,
      routable: true,
      recommendUpdate: false
    }
  }
  if (ageDays <= STALENESS_THRESHOLDS.staleMaxDays) {
    return {
      tier: "stale",
      ageDays,
      label: "Stale",
      guidance: `Map data is ${ageDays} days old. An update is recommended before relying on these routes.`,
      routable: true,
      recommendUpdate: true
    }
  }
  return {
    tier: "very-stale",
    ageDays,
    label: "Very stale",
    guidance: `Map data is ${ageDays} days old. Re-download before your next offline ride to avoid routing on stale roads.`,
    routable: true,
    recommendUpdate: true
  }
}

/**
 * Whether to prompt the rider to rebuild a saved corridor pack after a
 * newer region graph is installed. The planner never silently modifies
 * a saved ride immediately before departure; this helper returns true
 * only so the UI can ask, "A newer Pennsylvania map is available.
 * Rebuild this ride's offline corridor?"
 */
export function shouldPromptCorridorRebuild(input: {
  corridorBundleVersion: string
  regionBundleVersion: string
  withinDaysOfRide: number
}): boolean {
  if (input.corridorBundleVersion === input.regionBundleVersion) return false
  return input.withinDaysOfRide <= 7
}
