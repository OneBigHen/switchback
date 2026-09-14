import type { RouteWarning } from "@/lib/domain/contracts"
import type { PlannedRoute, TollPolicy } from "./types"

/** Stable identity for one rider-facing warning, independent of array order. */
export function routeWarningIdentity(warning: RouteWarning): string {
  return [warning.code, warning.segmentId ?? "", warning.message].join("|")
}

/** Merge warning evidence without overwriting distinct conditions. */
export function mergeRouteWarnings(
  ...warningSets: readonly (readonly RouteWarning[] | undefined)[]
): RouteWarning[] {
  const seen = new Set<string>()
  const merged: RouteWarning[] = []
  for (const warnings of warningSets) {
    for (const warning of warnings ?? []) {
      const identity = routeWarningIdentity(warning)
      if (seen.has(identity)) continue
      seen.add(identity)
      merged.push(warning)
    }
  }
  return merged
}

/**
 * Turn measured toll evidence into the existing typed route-warning contract.
 * Missing/unknown evidence stays silent here: no provider fact means no
 * invented toll claim.
 */
export function tollWarningsForRoute(
  route: Pick<PlannedRoute, "tollEvidence">,
  tollPolicy: TollPolicy
): RouteWarning[] {
  const share = route.tollEvidence?.tollSharePercent
  if (
    tollPolicy !== "allow-with-warning" ||
    route.tollEvidence?.known !== true ||
    typeof share !== "number" ||
    !Number.isFinite(share) ||
    share <= 0
  ) {
    return []
  }

  const formattedShare = Number.isInteger(share) ? String(share) : share.toFixed(1)
  return [{
    code: "toll-exposure",
    severity: "warning",
    message: `Known toll exposure covers ${formattedShare}% of this route. Check toll charges before riding.`
  }]
}

/** Attach policy-derived warnings while preserving any provider warnings. */
export function withRoutePolicyWarnings<T extends PlannedRoute>(
  route: T,
  tollPolicy: TollPolicy
): T {
  const warnings = mergeRouteWarnings(route.warnings, tollWarningsForRoute(route, tollPolicy))
  return warnings.length > 0 ? { ...route, warnings } : route
}
