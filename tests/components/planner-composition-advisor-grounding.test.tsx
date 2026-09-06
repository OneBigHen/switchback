import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ComponentProps, ReactNode } from "react"
import type { PlannedRoute } from "@/lib/routing/types"
import type {
  PlannerDeckCommands,
  PlannerDeckViewModel
} from "@/components/planner/PlannerDeckViewModel"
import type { RouteComparison } from "@/components/planner/RouteComparison"

vi.mock("@/stores/planner-store", () => ({
  usePlannerStore: (selector: (state: { recoveryStatus: string }) => unknown) =>
    selector({ recoveryStatus: "ready" })
}))

vi.mock("@/components/planner/PlannerDeck", () => ({
  PlannerDeck: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}))

vi.mock("@/components/planner/v2/RouteDecisionRail", () => ({
  RouteDecisionRail: () => <div data-testid="route-decisions" />
}))

vi.mock("@/components/planner/v2/RideAdvisor", () => ({
  RideAdvisor: () => <div data-testid="ride-advisor" />
}))

vi.mock("@/components/planner/RideIntentFeedback", () => ({
  RideIntentFeedback: () => null
}))

import { PlannerComposition } from "@/components/planner/PlannerComposition"

const route = {
  id: "retained-route",
  name: "Previous route",
  profile: "balanced",
  distanceMiles: 42,
  durationMinutes: 68,
  geometry: [[-75.1, 40.2], [-75.2, 40.3]],
  waypoints: [],
  instructions: [],
  warnings: [],
  twistiness: 30,
  turnCount: 4,
  roadMix: {},
  surfaceMix: {}
} as unknown as PlannedRoute

function viewModel(hasUnappliedChange: boolean): PlannerDeckViewModel {
  return {
    rideHistory: {
      canUndoRideChange: true,
      canRedoRideChange: false,
      lastChangeLabel: "Changed destination",
      hasUnappliedChange
    }
  } as unknown as PlannerDeckViewModel
}

const commands = {} as PlannerDeckCommands
const comparison = {
  routes: [route],
  selectedId: route.id,
  onSelect: vi.fn()
} as unknown as ComponentProps<typeof RouteComparison>

describe("PlannerComposition advisor grounding", () => {
  it("does not let Gravel Goblin advise from a retained route after the ride intent changed", () => {
    render(
      <PlannerComposition
        viewModel={viewModel(true)}
        commands={commands}
        comparison={comparison}
        onAddAdvisorStop={vi.fn()}
      />
    )

    expect(screen.getByTestId("route-decisions")).toBeInTheDocument()
    expect(screen.queryByTestId("ride-advisor")).not.toBeInTheDocument()
  })

  it("keeps the advisor available when the displayed route answers the current ride", () => {
    render(
      <PlannerComposition
        viewModel={viewModel(false)}
        commands={commands}
        comparison={comparison}
        onAddAdvisorStop={vi.fn()}
      />
    )

    expect(screen.getByTestId("ride-advisor")).toBeInTheDocument()
  })
})
