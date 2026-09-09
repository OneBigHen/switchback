import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePlannerRideIntent } from "@/components/planner/usePlannerRideIntent"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import { requestRideIntent } from "@/lib/client/ride-intent-client"
import type { RideIntent } from "@/lib/ai/ride-intent"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

vi.mock("@/lib/client/ride-intent-client", () => ({ requestRideIntent: vi.fn() }))
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
const viaA = { lat: 40.30, lon: -76.70, label: "Shaping stop 1" }
const viaB = { lat: 40.32, lon: -76.50, label: "Shaping stop 2" }

/**
 * Per-leg styles describe legs. A free-form prompt replaces the ride's
 * topology, so the legs they described stop existing.
 *
 * The prompt commit set `via: []` but left `segmentProfiles` untouched, and the
 * request was built from a stale closure variable rather than from the store.
 * A three-leg ride re-prompted into a single-leg one therefore sent three
 * per-leg styles for one leg — a cardinality the canonical points no longer
 * support.
 *
 * Clearing is the honest answer rather than truncating: the rider stated one
 * style for the new ride, and keeping the old leg-1 style would silently
 * preserve a choice they did not repeat.
 */
function intent(overrides: Partial<RideIntent> = {}): RideIntent {
  return {
    mode: "destination",
    profile: "balanced",
    rideCharacter: "balanced",
    targetMinutes: null,
    tollPolicy: "allow-with-warning",
    ambiguous: false,
    startQuery: null,
    destinationQuery: "New Hope",
    stopQuery: null,
    preferGravel: false,
    avoidHighways: false,
    summary: "a ride to New Hope",
    source: "local",
    ...overrides
  } as RideIntent
}

function renderIntent(runTripPlan = vi.fn().mockResolvedValue(null)) {
  return {
    runTripPlan,
    hook: renderHook(() => usePlannerRideIntent({
      gate: createLatestRequestGate(),
      home: null,
      targetMinutes: 120,
      avoidAreas: [],
      nextSeed: () => 18,
      runTripPlan,
      setStopIdeas: vi.fn(),
      setResearchSources: vi.fn(),
      setIntentStatus: vi.fn(),
      setIntentSummary: vi.fn(),
      onNotice: vi.fn()
    }))
  }
}

beforeEach(() => {
  localStorage.clear()
  usePlannerStore.setState({
    ...initialPlannerState,
    start,
    startQuery: start.label,
    via: [viaA, viaB],
    profile: "twisty",
    // Three legs, three styles: start -> A -> B -> finish.
    segmentProfiles: ["twisty", "scenic", "gravel"]
  })
  vi.mocked(requestRideIntent).mockReset().mockResolvedValue(intent())
})

afterEach(() => cleanup())

describe("a fresh ride topology cannot inherit stale per-leg styles", () => {
  it("never sends more per-leg styles than the new ride has legs", async () => {
    const { hook, runTripPlan } = renderIntent()

    await act(async () => {
      await hook.result.current("take me to New Hope instead")
    })

    const request = runTripPlan.mock.calls[0]![0] as {
      via?: unknown[]
      segmentProfiles?: unknown[]
    }
    const legs = (request.via?.length ?? 0) + 1
    expect(legs).toBe(1)
    expect(request.segmentProfiles ?? []).toHaveLength(0)
  })

  it("clears the styles in canonical state, not just in the request", async () => {
    const { hook } = renderIntent()

    await act(async () => {
      await hook.result.current("take me to New Hope instead")
    })

    // Canonical state is what the next replan is built from, so a stale array
    // left here comes back on the following request.
    expect(usePlannerStore.getState().segmentProfiles).toHaveLength(0)
    expect(usePlannerStore.getState().via).toHaveLength(0)
  })

  it("clears them for a loop request too", async () => {
    vi.mocked(requestRideIntent).mockResolvedValue(intent({
      mode: "loop",
      destinationQuery: null,
      targetMinutes: 90,
      summary: "a 90-minute loop"
    }))
    const { hook, runTripPlan } = renderIntent()

    await act(async () => {
      await hook.result.current("give me a 90 minute loop instead")
    })

    expect(usePlannerStore.getState().segmentProfiles).toHaveLength(0)
    expect((runTripPlan.mock.calls[0]![0] as { segmentProfiles?: unknown[] }).segmentProfiles ?? [])
      .toHaveLength(0)
  })
})
