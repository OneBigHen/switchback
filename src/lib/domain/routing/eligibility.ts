import type { PlannedRoute } from "@/lib/routing/types"
import type { RoadLockSatisfaction } from "@/lib/roads/road-locks"

/**
 * Route eligibility (SB-002): hard rules that a route either passes or fails.
 *
 * Eligibility is separate from ranking. A failed candidate is NEVER converted
 * into a ranking penalty, selected "because it is closest", or described as
 * safe. The planner returns an eligible baseline instead.
 */

export type EligibilityFailureCode =
  | "invalid-geometry"
  | "preview-only"
  | "must-road-unresolved"
  | "illegal-access"
  | "outside-coverage"

export interface EligibilityFailure {
  code: EligibilityFailureCode
  message: string
}

export interface RouteEligibility {
  eligible: boolean
  failures: EligibilityFailure[]
}

/** A guidance route must have real traversable geometry. */
function geometryFailure(route: PlannedRoute): EligibilityFailure | null {
  if (!route.geometry || route.geometry.length < 2) {
    return {
      code: "invalid-geometry",
      message: "This route has no usable geometry."
    }
  }
  return null
}

/**
 * Preview-only geometry (e.g. a sketched line never routed through the
 * provider) must never be used for guidance or offered as a rideable route.
 */
function previewFailure(route: PlannedRoute): EligibilityFailure | null {
  if (route.previewOnly) {
    return {
      code: "preview-only",
      message: "This is a sketched line, not a routed route. Plan it before riding."
    }
  }
  return null
}

/**
 * A `must` road requirement that the route does not traverse makes the route
 * ineligible for this rider — it is not a soft preference to be traded off
 * against duration (SB-006/SB-014).
 */
function mustRoadFailure(route: PlannedRoute): EligibilityFailure | null {
  const unsatisfied = (route.lockSatisfaction ?? []).find((row: RoadLockSatisfaction) =>
    row.mode === "must" && !row.satisfied
  )
  if (unsatisfied) {
    return {
      code: "must-road-unresolved",
      message: unsatisfied.match.kind === "unresolved"
        ? unsatisfied.match.reason
        : "A required road could not be traversed on this route."
    }
  }
  return null
}

/**
 * Evaluate hard eligibility for a candidate route. Hard rules that depend
 * only on the route are applied today; provider/coverage context is a future
 * extension point.
 */
export function evaluateEligibility(route: PlannedRoute): RouteEligibility {
  const failures = [
    geometryFailure(route),
    previewFailure(route),
    mustRoadFailure(route)
  ].filter((failure): failure is EligibilityFailure => failure !== null)
  return {
    eligible: failures.length === 0,
    failures
  }
}

export function isEligible(route: PlannedRoute): boolean {
  return evaluateEligibility(route).eligible
}
