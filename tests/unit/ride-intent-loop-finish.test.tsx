import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePlannerRideIntent } from "@/components/planner/usePlannerRideIntent"
import { createLatestRequestGate } from "@/lib/client/latest-request"
import { requestRideIntent } from "@/lib/client/ride-intent-client"
import type { RideIntent } from "@/lib/ai/ride-intent"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

vi.mock("@/lib/client/ride-intent-client", () => ({ requestRideIntent: vi.fn() }))

const start = { lat: 40.2732, lon: -76.8867, label: "Start" }
const oldFinish = { lat: 39.9526, lon: -75.1652, label: "Old destination" }

function loopIntent(): RideIntent {
  return {
    mode: "loop",
    profile: "twisty",
    rideCharacter: "twisty",
    targetMinutes: 90,
    tollPolicy: "allow-with-warning",
    ambiguous: false,
    startQuery: null,
    destinationQuery: null,
    stopQuery: null,
    preferGravel: false,
    avoidHighways: true,
    summary: "a 90-minute loop",
    source: "local"
  }
}

beforeEach(() => {
  localStorage.clear()
  usePlannerStore.setState({
    ...initialPlannerState,
    start,
    finish: oldFinish,
    startQuery: start.label,
    finishQuery: oldFinish.label
  })
  vi.mocked(requestRideIntent).mockReset().mockResolvedValue(loopIntent())
})

afterEach(() => cleanup())

describe("free-form loop intent", () => {
  it("clears a previous destination as part of the same loop command", async () => {
    const runTripPlan = vi.fn().mockResolvedValue(null)
    const gate = createLatestRequestGate()
    const { result } = renderHook(() => usePlannerRideIntent({
      gate,
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

    await act(async () => {
      await result.current("Give me a 90-minute loop")
    })

    expect(usePlannerStore.getState().mode).toBe("loop")
    expect(usePlannerStore.getState().finish).toBeNull()
    expect(usePlannerStore.getState().finishQuery).toBe("")
    expect(runTripPlan).toHaveBeenCalledTimes(1)
  })
})
