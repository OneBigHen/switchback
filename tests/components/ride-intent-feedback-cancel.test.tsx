import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RideIntentFeedback } from "@/components/planner/RideIntentFeedback"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "@/components/planner/PlannerDeckViewModel"
import type { PlannedRoute } from "@/lib/routing/types"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

const start = { lat: 40.2, lon: -76.9, label: "Start" }
const finish = { lat: 40.3, lon: -76.8, label: "Finish" }
const route: PlannedRoute = {
  id: "committed-route",
  name: "Committed route",
  profile: "twisty",
  geometry: [[-76.9, 40.2], [-76.8, 40.3]],
  waypoints: [start, finish],
  instructions: [],
  distanceMiles: 20,
  durationMinutes: 35,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 70,
  turnCount: 12,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

beforeEach(() => {
  localStorage.clear()
  usePlannerStore.setState(initialPlannerState)
  const store = usePlannerStore.getState()
  store.editRide({ start, finish }, "Initial ride")
  store.applyPlan({ selectedRouteId: route.id, routes: [route], warnings: [] })
  store.editRide({ targetMinutes: 90 }, "Changed ride time")
})

afterEach(() => cleanup())

describe("RideIntentFeedback cancel semantics", () => {
  it("needs only one Cancel to stop reporting an unapplied ride change", async () => {
    const commands = {
      rideHistory: {
        onUndoRideChange: vi.fn(),
        onRedoRideChange: vi.fn()
      },
      onPlan: vi.fn(),
      onCancelRideChange: () => usePlannerStore.getState().cancelRideUpdate()
    } as unknown as PlannerDeckCommands
    const viewModel = {
      rideHistory: {
        canUndoRideChange: true,
        canRedoRideChange: false,
        lastChangeLabel: "Changed ride time",
        hasUnappliedChange: true
      }
    } as unknown as PlannerDeckViewModel

    render(<RideIntentFeedback viewModel={viewModel} commands={commands} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Cancel ride change" }))

    expect(usePlannerStore.getState().targetMinutes).toBe(120)
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Cancel ride change" })).not.toBeInTheDocument()
    })
  })
})
