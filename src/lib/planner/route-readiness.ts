import type { PlannedRoute } from "@/lib/routing/types"

export const LOOP_TIMEBOX_TOLERANCE = 0.15

export interface LoopTimeboxMismatch {
  requestedMinutes: number
  actualMinutes: number
  errorRatio: number
  /** Which way the candidate misses the request. The rider is told the truth:
   *  an over-long loop is never described as a shorter ride. */
  direction: "shorter" | "longer"
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
    errorRatio,
    direction: actualMinutes < route.loopTargetMinutes ? "shorter" : "longer"
  }
}

export function routeNeedsExplicitAcceptance(route: PlannedRoute | null | undefined): boolean {
  return getLoopTimeboxMismatch(route) !== null
}

/**
 * Identity of the exact result a rider accepted a timebox miss for.
 *
 * A route id alone is too weak: a replan can return a materially different
 * candidate under the same id, and a stale acceptance must not carry over to
 * it. The key binds the acceptance to the canonical result revision *and* to
 * the two numbers the rider was actually shown when they accepted, so any
 * newer answer — or any different duration — asks again.
 */
export function loopTimeboxAcceptanceKey(
  route: PlannedRoute | null | undefined,
  resultRevision: string | null | undefined
): string | null {
  const mismatch = getLoopTimeboxMismatch(route)
  if (!mismatch || !route) return null
  return [
    resultRevision ?? "unidentified-result",
    route.id,
    mismatch.requestedMinutes,
    mismatch.actualMinutes
  ].join("|")
}
