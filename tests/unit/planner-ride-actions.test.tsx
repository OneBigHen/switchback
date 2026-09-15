import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { usePlannerRideActions } from "@/components/planner/usePlannerRideActions"
import type { PlannedRoute } from "@/lib/routing/types"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"
import { navigationStore } from "@/stores/navigation-store"
import { telemetry } from "@/lib/telemetry/client"

function route(): PlannedRoute {
  return {
    id: "route-ready-for-ride",
    name: "Ready route",
    profile: "scenic",
    geometry: [[-77, 40], [-76.9, 40.1]],
    waypoints: [],
    instructions: [{
      distanceMeters: 100,
      timeMilliseconds: 10_000,
      sign: 2,
      text: "Turn right",
      streetName: "Main Street",
      interval: [0, 1]
    }],
    distanceMiles: 12,
    durationMinutes: 25,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 30,
    turnCount: 8,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    provider: "graphhopper",
    previewOnly: false
  }
}

describe("planner ride action boundary", () => {
  beforeEach(() => {
    usePlannerStore.setState({ ...initialPlannerState, recoveryStatus: "ready" })
    navigationStore.clear()
  })

  it("notifies observability only after a route becomes the active ride", async () => {
    const started = vi.fn()
    const { result } = renderHook(() => usePlannerRideActions({
      runTripPlan: vi.fn(),
      invalidateRequests: vi.fn(),
      setRideOriginalRoute: vi.fn(),
      onNotice: vi.fn(),
      onNavigationStarted: started
    }))

    let startedResult: boolean | undefined
    await act(async () => { startedResult = await result.current.startRide(route()) })

    expect(usePlannerStore.getState().surface).toBe("ride")
    expect(startedResult).toBe(true)
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ id: "route-ready-for-ride" }))
  })

  it("records the primary start-ride action at the real activation boundary", async () => {
    const capture = vi.spyOn(telemetry, "capture")
    const { result } = renderHook(() => usePlannerRideActions({
      runTripPlan: vi.fn(),
      invalidateRequests: vi.fn(),
      setRideOriginalRoute: vi.fn(),
      onNotice: vi.fn()
    }))

    await act(async () => { await result.current.startRide(route()) })

    expect(capture).toHaveBeenCalledWith("primary_action_invoked", {
      surface: "plan",
      control: "unknown",
      action: "start-ride"
    })
  })
})
