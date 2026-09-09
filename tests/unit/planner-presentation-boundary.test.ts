import { describe, expect, it, vi } from "vitest"
import { createPlannerPresentationBoundary } from "@/components/planner/PlannerPresentationBoundary"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "@/components/planner/PlannerDeckViewModel"

describe("planner presentation boundary", () => {
  it("groups existing planner input into one model + commands contract without cloning authority", () => {
    const deck = {} as PlannerDeckViewModel
    const deckCommands = {} as PlannerDeckCommands
    const comparison = { routes: [], selectedId: "", onSelect: vi.fn() } as never
    const warnings = ["Surface evidence is incomplete"]
    const addAdvisorStop = vi.fn()
    const planAdvisorRide = vi.fn()
    const origin = { lat: 40.2, lon: -75.1, label: "Home" }

    const boundary = createPlannerPresentationBoundary({
      viewModel: deck,
      commands: deckCommands,
      comparison,
      planWarnings: warnings,
      onAddAdvisorStop: addAdvisorStop,
      onPlanAdvisorRide: planAdvisorRide,
      advisorOrigin: origin,
      bootstrapPending: true
    })

    expect(boundary.model.deck).toBe(deck)
    expect(boundary.model.comparison).toBe(comparison)
    expect(boundary.model.planWarnings).toBe(warnings)
    expect(boundary.model.advisorOrigin).toBe(origin)
    expect(boundary.model.bootstrapPending).toBe(true)
    expect(boundary.commands.deck).toBe(deckCommands)
    expect(boundary.commands.addAdvisorStop).toBe(addAdvisorStop)
    expect(boundary.commands.planAdvisorRide).toBe(planAdvisorRide)
  })

  it("keeps optional advisor commands absent instead of manufacturing no-op behavior", () => {
    const boundary = createPlannerPresentationBoundary({
      viewModel: {} as PlannerDeckViewModel,
      commands: {} as PlannerDeckCommands,
      comparison: null,
      bootstrapPending: false
    })

    expect(boundary.commands.addAdvisorStop).toBeUndefined()
    expect(boundary.commands.planAdvisorRide).toBeUndefined()
    expect(boundary.model.advisorOrigin).toBeNull()
  })
})
