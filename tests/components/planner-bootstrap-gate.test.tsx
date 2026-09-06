import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { PlannerComposition } from "@/components/planner/PlannerComposition"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "@/components/planner/PlannerDeckViewModel"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

vi.mock("@/components/planner/PlannerDeck", () => ({
  PlannerDeck: ({ children }: { children?: ReactNode }) => (
    <div data-testid="planner-deck">
      <input aria-label="Ride request" />
      {children}
    </div>
  )
}))

afterEach(() => {
  cleanup()
  usePlannerStore.setState(initialPlannerState)
})

function compositionProps() {
  return {
    comparison: null,
    viewModel: {
      rideHistory: {
        canUndoRideChange: false,
        canRedoRideChange: false,
        lastChangeLabel: null,
        hasUnappliedChange: false
      }
    } as PlannerDeckViewModel,
    commands: {
      rideHistory: { onUndoRideChange: vi.fn(), onRedoRideChange: vi.fn() },
      onPlan: vi.fn(),
      onCancelRideChange: vi.fn()
    } as unknown as PlannerDeckCommands
  }
}

/**
 * Checkpoint recovery resolves asynchronously, so there is a window between
 * first paint and a settled ride. The planner may *report* that window; it may
 * not confiscate the deck for the duration of it.
 *
 * Gating the subtree with `inert` did confiscate it, and did so invisibly: a
 * rider who began describing their ride the moment the app painted had every
 * keystroke accepted into a void, ending up with an empty field and a submit
 * button that stayed disabled until they typed the whole thing again. Nothing
 * said why, because `inert` has no visible state.
 *
 * Nothing needed that protection. Bootstrap is only unsafe if a checkpoint that
 * resolves late can overwrite an edit the rider already made, and the store
 * forbids exactly that: `restoreRide` adopts a checkpoint only while the intent
 * identity is still the one recovery started with, and reports `superseded`
 * otherwise. jsdom reflects `inert` without enforcing it, so this asserts the
 * attribute contract the browser would act on.
 */
describe("planner bootstrap gate", () => {
  it("reports that recovery is still settling without making the deck inert", () => {
    usePlannerStore.setState({ recoveryStatus: "loading" })
    const { container } = render(<PlannerComposition {...compositionProps()} />)

    expect(container.querySelector("[aria-busy='true']")).not.toBeNull()
    expect(container.querySelector("[inert]")).toBeNull()
    // The composer the rider types into must be inside the reported region,
    // or the assertion above proves nothing about the field that was lost.
    expect(container.querySelector("[aria-busy='true'] input[aria-label='Ride request']")).not.toBeNull()
  })

  it("stops reporting busy once recovery settles", () => {
    usePlannerStore.setState({ recoveryStatus: "ready" })
    const { container } = render(<PlannerComposition {...compositionProps()} />)

    expect(container.querySelector("[aria-busy='true']")).toBeNull()
    expect(container.querySelector("[inert]")).toBeNull()
  })
})
