import { explainRouteFit, type RiderPreference, type RouteFitExplanation } from "@/lib/intelligence/rider-preferences"
import type { PlannedRoute } from "@/lib/routing/types"

export interface RiderRankedRoute {
  route: PlannedRoute
  fit: RouteFitExplanation
  rankingScore: number
}

export function canApplyRankedRouteSelection(input: {
  expectedPlanKey: string
  currentPlanKey: string | null
  currentRouteIds: string[]
  rankedRouteId: string
  selectionSource: "automatic" | "user"
}): boolean {
  return input.selectionSource !== "user"
    && input.currentPlanKey === input.expectedPlanKey
    && input.currentRouteIds.includes(input.rankedRouteId)
}

/**
 * Blend deterministic route quality with explicit local rider history. The
 * provider score remains the anchor; learning can choose among legal
 * candidates but cannot make an unsafe or rejected route eligible.
 */
export function rankRoutesForRider(
  routes: PlannedRoute[],
  preference: RiderPreference
): RiderRankedRoute[] {
  return routes
    .map((route, index) => {
      const fit = explainRouteFit(preference, route)
      const baseScore = route.routeScore?.total ?? 50
      return {
        route,
        fit,
        rankingScore: baseScore * 0.65 + fit.score * 0.35,
        index
      }
    })
    .sort((left, right) => right.rankingScore - left.rankingScore || left.index - right.index)
    .map(({ route, fit, rankingScore }) => ({ route, fit, rankingScore }))
}
