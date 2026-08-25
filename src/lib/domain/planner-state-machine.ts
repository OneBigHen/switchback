import type { PlanningPhase } from "@/stores/planner-store"

/**
 * Explicit planner lifecycle state machine (SB-022).
 *
 *   idle → interpreting → geocoding → routing-primary → alternatives → ready
 *        ↘ routing-primary (manual plan)
 *   ready → routing-primary (replan) / interpreting (new intent) / idle
 *   any   → cancelled / error
 *   cancelled / error → idle, or directly into a new lifecycle
 *     (interpreting / geocoding / routing-primary), the same way `ready` can
 *     start a fresh one. A terminal phase must never block the *next* plan:
 *     `cancelPlanning()`/`failRouting()` bypass this gate and set the phase
 *     directly, so every later `setPlanningPhase` call from the new lifecycle
 *     (starting with "interpreting" for a prompt, or "routing-primary" for a
 *     direct replan) has to be a legal source transition, or the rider is
 *     left with a planner that silently stops reporting progress after the
 *     first cancel/error for the rest of the session.
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
  cancelled: new Set(["idle", "interpreting", "geocoding", "routing-primary"]),
  error: new Set(["idle", "interpreting", "geocoding", "routing-primary"])
}

export function canTransitionPlannerPhase(from: PlanningPhase, to: PlanningPhase): boolean {
  return PLANNER_PHASE_TRANSITIONS[from]?.has(to) ?? false
}
