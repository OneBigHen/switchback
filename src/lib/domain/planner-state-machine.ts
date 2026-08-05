import type { PlanningPhase } from "@/stores/planner-store"

/**
 * Explicit planner lifecycle state machine (SB-022).
 *
 *   idle → interpreting → geocoding → routing-primary → alternatives → ready
 *        ↘ routing-primary (manual plan)
 *   ready → routing-primary (replan) / interpreting (new intent) / idle
 *   any   → cancelled / error ; cancelled / error → idle
 *
 * A phase may only move along the allowed edges; anything else is ignored so
 * no combination of unrelated booleans can fake a lifecycle state.
 */
export const PLANNER_PHASE_TRANSITIONS: Record<PlanningPhase, ReadonlySet<PlanningPhase>> = {
  idle: new Set(["interpreting", "geocoding", "routing-primary", "cancelled", "error"]),
  interpreting: new Set(["geocoding", "routing-primary", "ready", "cancelled", "error"]),
  geocoding: new Set(["routing-primary", "ready", "cancelled", "error"]),
  "routing-primary": new Set(["alternatives", "ready", "cancelled", "error"]),
  alternatives: new Set(["ready", "cancelled", "error"]),
  ready: new Set(["routing-primary", "interpreting", "idle", "cancelled", "error"]),
  cancelled: new Set(["idle"]),
  error: new Set(["idle"])
}

export function canTransitionPlannerPhase(from: PlanningPhase, to: PlanningPhase): boolean {
  return PLANNER_PHASE_TRANSITIONS[from]?.has(to) ?? false
}
