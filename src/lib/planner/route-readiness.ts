import type { PlannedRoute } from "@/lib/routing/types"

export const LOOP_TIMEBOX_TOLERANCE = 0.15

export interface LoopTimeboxMismatch {
  requestedMinutes: number
  actualMinutes: number
  errorRatio: number
}

/**
 * A planner candidate is not an ordinary ready ride when it misses an explicit
 * loop duration by more than the routing planner's 15% acceptance tolerance.
 * Keep this calculation in one place so route cards and start CTAs cannot
 * disagree about readiness.
 */
export function getLoopTimeboxMismatch(route: PlannedRoute | null | undefined): LoopTimeboxMismatch | null {
  if (!route?.loopTargetMinutes || route.loopTargetMinutes <= 0) return null
  const actualMinutes = Math.max(0, route.durationMinutes)
  const errorRatio = Math.abs(actualMinutes - route.loopTargetMinutes) / route.loopTargetMinutes
  if (errorRatio <= LOOP_TIMEBOX_TOLERANCE) return null
  return {
    requestedMinutes: Math.round(route.loopTargetMinutes),
    actualMinutes: Math.round(actualMinutes),
    errorRatio
  }
}

export function routeNeedsExplicitAcceptance(route: PlannedRoute | null | undefined): boolean {
  return getLoopTimeboxMismatch(route) !== null
}