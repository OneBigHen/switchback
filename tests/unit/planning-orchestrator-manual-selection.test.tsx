import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePlanningOrchestrator } from "@/components/planner/usePlanningOrchestrator"
import { routeEntityCache } from "@/lib/client/route-entity-cache"
import { requestTripPlan } from "@/lib/client/routing-client"
import type { TripPlan } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

vi.mock("@/lib/client/routing-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/client/routing-client")>(),
  requestTripPlan: vi.fn()
}))
vi.mock("@/lib/client/corridor-hints-client", () => ({
  refreshCorridorHints: vi.fn().mockResolvedValue(undefined)
}))

const start = { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
const finish = { lat: 40.3643, lon: -74.9513, label: "New Hope" }

function route(id: string): PlannedRoute {
  return {
    id,
    name: id,
    profile: "balanced",
    geometry: [[-76.9, 40.2], [-76.8, 40.25], [-76.7, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 42,
    durationMinutes: 68,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 40,
    turnCount: 18,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

function plan(id: string): TripPlan {
  return { selectedRouteId: id, routes: [route(id)], warnings: [], planningId: id }
}

beforeEach(() => {
  localStorage.clear()
  routeEntityCache.clear()
  usePlannerStore.setState({ ...initialPlannerState, recoveryStatus: "ready", start, finish })
  vi.mocked(requestTripPlan).mockReset()
})

afterEach(() => {
  cleanup()
})

describe("manual route selection fences planning ownership", () => {
  it("keeps a late provider answer from overwriting a route selected through the canonical store", async () => {
    let releasePrimary!: (value: TripPlan) => void
    vi.mocked(requestTripPlan).mockImplementation((request) => {
      if (request.candidateSet === "alternatives") {
        return Promise.resolve({ selectedRouteId: "", routes: [], warnings: [] })
      }
      return new Promise<TripPlan>((resolve) => { releasePrimary = resolve })
    })

    const { result } = renderHook(() => usePlanningOrchestrator({ onWarning: vi.fn() }))
    let pending!: Promise<TripPlan | null>
    act(() => { pending = result.current.plan() })
    await waitFor(() => expect(usePlannerStore.getState().status).toBe("routing"))

    // PlannerMapStage's route-ribbon click reaches this exact store command.
    // It must fence the in-flight answer even when the surface itself knows
    // nothing about the orchestrator's request gate.
    act(() => { usePlannerStore.getState().selectRoute("manual-route") })
    releasePrimary(plan("late-provider-route"))
    await act(async () => { await pending })

    expect(usePlannerStore.getState().selectedRouteId).toBe("manual-route")
    expect(usePlannerStore.getState().selectionSource).toBe("user")
  })
})
