import { beforeEach, describe, expect, it } from "vitest"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"
import { canTransitionPlannerPhase } from "@/lib/domain/planner-state-machine"

describe("planner state machine (SB-022)", () => {
  it("follows the documented lifecycle edges", () => {
    expect(canTransitionPlannerPhase("idle", "interpreting")).toBe(true)
    expect(canTransitionPlannerPhase("interpreting", "geocoding")).toBe(true)
    expect(canTransitionPlannerPhase("geocoding", "routing-primary")).toBe(true)
    expect(canTransitionPlannerPhase("routing-primary", "alternatives")).toBe(true)
    expect(canTransitionPlannerPhase("alternatives", "ready")).toBe(true)
    expect(canTransitionPlannerPhase("idle", "routing-primary")).toBe(true)
    expect(canTransitionPlannerPhase("ready", "routing-primary")).toBe(true)
  })

  it("rejects invalid jumps", () => {
    expect(canTransitionPlannerPhase("idle", "ready")).toBe(false)
    expect(canTransitionPlannerPhase("idle", "alternatives")).toBe(false)
    expect(canTransitionPlannerPhase("alternatives", "routing-primary")).toBe(false)
    expect(canTransitionPlannerPhase("cancelled", "ready")).toBe(false)
    expect(canTransitionPlannerPhase("error", "alternatives")).toBe(false)
  })

  it("ends at terminal states and only returns to idle", () => {
    expect(canTransitionPlannerPhase("cancelled", "idle")).toBe(true)
    expect(canTransitionPlannerPhase("error", "idle")).toBe(true)
  })

  it("lets a terminal phase start a brand-new lifecycle, same as idle/ready", () => {
    // A cancelled or errored plan must not permanently block the *next* one:
    // the rider's very next prompt (→ interpreting) or direct replan
    // (→ routing-primary) has to be a legal source transition, or the phase
    // gets stuck at "cancelled"/"error" for the rest of the session and the
    // planning-progress UI silently stops updating.
    expect(canTransitionPlannerPhase("cancelled", "interpreting")).toBe(true)
    expect(canTransitionPlannerPhase("cancelled", "routing-primary")).toBe(true)
    expect(canTransitionPlannerPhase("error", "interpreting")).toBe(true)
    expect(canTransitionPlannerPhase("error", "routing-primary")).toBe(true)
  })
})

describe("planner store phase guard", () => {
  beforeEach(() => usePlannerStore.setState(initialPlannerState))

  it("ignores an illegal phase transition instead of faking a lifecycle state", () => {
    usePlannerStore.getState().setPlanningPhase("routing-primary")
    // routing-primary → alternatives is the real alternatives phase: allowed.
    usePlannerStore.getState().setPlanningPhase("alternatives")
    expect(usePlannerStore.getState().planningPhase).toBe("alternatives")
    // alternatives → routing-primary is invalid: ignored.
    usePlannerStore.getState().setPlanningPhase("routing-primary")
    expect(usePlannerStore.getState().planningPhase).toBe("alternatives")
    // idle → ready is invalid: ignored.
    usePlannerStore.setState({ ...initialPlannerState, planningPhase: "idle" })
    usePlannerStore.getState().setPlanningPhase("ready")
    expect(usePlannerStore.getState().planningPhase).toBe("idle")
  })

  it("allows the real intent shortcut interpreting → ready", () => {
    usePlannerStore.getState().setPlanningPhase("interpreting")
    usePlannerStore.getState().setPlanningPhase("ready")
    expect(usePlannerStore.getState().planningPhase).toBe("ready")
    expect(usePlannerStore.getState().planningStartedAt).toBeNull()
  })
})
