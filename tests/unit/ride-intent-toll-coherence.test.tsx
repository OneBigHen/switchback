import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePlannerRideIntent } from "@/components/planner/usePlannerRideIntent"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import { requestRideIntent } from "@/lib/client/ride-intent-client"
import type { RideIntent } from "@/lib/ai/ride-intent"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

vi.mock("@/lib/client/ride-intent-client", () => ({ requestRideIntent: vi.fn() }))
// The prompt commits only once every place resolves, so the destination has to
// come back from somewhere.
vi.mock("@/lib/client/geocoding-client", () => ({
  searchPlacesClient: vi.fn().mockResolvedValue([{
    id: "new-hope",
    label: "New Hope, PA",
    name: "New Hope",
    region: "Pennsylvania",
    country: "United States",
    lat: 40.3643,
    lon: -74.9513
  }])
}))

const start = { lat: 40.2732, lon: -76.8867, label: "Start" }

/**
 * "Avoid tolls to New Hope" is one rider decision, and it has to land in one
 * place: the canonical ride.
 *
 * The prompt path passed `intent.tollPolicy` into the route request but left it
 * out of the `editRide` commit, so the ride that came back avoided tolls while
 * the canonical intent still said `allow-with-warning`. The visible toll
 * control disagreed with the route, Undo had nothing to undo, and — the part
 * that actually costs the rider — the next replan built from canonical state
 * quietly put the tolls back.
 */
function intent(overrides: Partial<RideIntent> = {}): RideIntent {
  return {
    mode: "destination",
    profile: "balanced",
    rideCharacter: "balanced",
    targetMinutes: null,
    tollPolicy: "avoid",
    ambiguous: false,
    startQuery: null,
    destinationQuery: "New Hope",
    stopQuery: null,
    preferGravel: false,
    avoidHighways: false,
    summary: "a toll-free ride to New Hope",
    source: "local",
    ...overrides
  } as RideIntent
}

function renderIntent(runTripPlan = vi.fn().mockResolvedValue(null)) {
  const gate = createLatestRequestGate()
  return renderHook(() => usePlannerRideIntent({
    gate,
    home: null,
    targetMinutes: 120,
    avoidAreas: [],
    segmentProfiles: [],
    nextSeed: () => 18,
    runTripPlan,
    setStopIdeas: vi.fn(),
    setResearchSources: vi.fn(),
    setIntentStatus: vi.fn(),
    setIntentSummary: vi.fn(),
    onNotice: vi.fn()
  }))
}

beforeEach(() => {
  localStorage.clear()
  usePlannerStore.setState({
    ...initialPlannerState,
    start,
    startQuery: start.label,
    tollPolicy: "allow-with-warning"
  })
  vi.mocked(requestRideIntent).mockReset().mockResolvedValue(intent())
})

afterEach(() => cleanup())

describe("a prompt's toll policy reaches the canonical ride", () => {
  it("commits the parsed policy, not just the route request", async () => {
    const runTripPlan = vi.fn().mockResolvedValue(null)
    const { result } = renderIntent(runTripPlan)

    await act(async () => {
      await result.current("avoid tolls to New Hope")
    })

    // The request already avoided tolls before this fix. The canonical ride is
    // what the visible control, Undo and every later replan read.
    expect(usePlannerStore.getState().tollPolicy).toBe("avoid")
    expect(runTripPlan.mock.calls[0]![0]).toMatchObject({ tollPolicy: "avoid" })
  })

  it("puts the policy in the same revision as the rest of the prompt", async () => {
    const { result } = renderIntent()

    await act(async () => {
      await result.current("avoid tolls to New Hope")
    })
    expect(usePlannerStore.getState().tollPolicy).toBe("avoid")

    // One prompt is one ride change, so one Undo restores the policy the rider
    // had before asking — not a ride that half-remembers the request.
    act(() => { usePlannerStore.getState().undoRideChange() })
    expect(usePlannerStore.getState().tollPolicy).toBe("allow-with-warning")
  })

  it("carries the inverse wording just as faithfully", async () => {
    usePlannerStore.setState({ tollPolicy: "avoid" })
    vi.mocked(requestRideIntent).mockResolvedValue(intent({ tollPolicy: "allow-with-warning" }))
    const { result } = renderIntent()

    await act(async () => {
      await result.current("tolls are fine, just get me to New Hope")
    })

    expect(usePlannerStore.getState().tollPolicy).toBe("allow-with-warning")
  })
})
