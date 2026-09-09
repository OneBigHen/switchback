import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { REPLAN_COALESCE_MS, usePlanningOrchestrator } from "@/components/planner/usePlanningOrchestrator"
import { routeEntityCache } from "@/lib/client/route-entity-cache"
import { requestTripPlan } from "@/lib/client/routing-client"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

/**
 * Only the network boundary is faked. The orchestrator runs against the real
 * planning-session controller, the real trip-planning coordinator and the real
 * store, because the contracts under test are about how those three interact.
 */
vi.mock("@/lib/client/routing-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/client/routing-client")>(),
  requestTripPlan: vi.fn()
}))
vi.mock("@/lib/client/corridor-hints-client", () => ({
  refreshCorridorHints: vi.fn().mockResolvedValue(undefined)
}))

const start = { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
const finish = { lat: 40.3643, lon: -74.9513, label: "New Hope" }
const detour = { lat: 40.41, lon: -75.62, label: "Kutztown" }

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

/** Primary requests only: alternatives are a second call in the same lifecycle. */
function primaryRequests(): TripPlanRequest[] {
  return vi.mocked(requestTripPlan).mock.calls
    .map(([request]) => request)
    .filter((request) => request.candidateSet !== "alternatives")
}

function renderOrchestrator(onWarning = vi.fn()) {
  return { onWarning, ...renderHook(() => usePlanningOrchestrator({ onWarning })) }
}

beforeEach(() => {
  localStorage.clear()
  routeEntityCache.clear()
  usePlannerStore.setState({ ...initialPlannerState, recoveryStatus: "ready" })
  vi.mocked(requestTripPlan).mockReset()
  // Alternatives resolve to nothing so each test observes one primary lifecycle.
  vi.mocked(requestTripPlan).mockImplementation(async (request) => (
    request.candidateSet === "alternatives"
      ? { selectedRouteId: "", routes: [], warnings: [] }
      : plan("route-primary")
  ))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("planning orchestrator", () => {
  it("plans the ride the store holds now, not the one a callback captured", async () => {
    usePlannerStore.setState({ start, finish, profile: "balanced" })
    const { result } = renderOrchestrator()
    // A callback captured before the rider changed anything.
    const planFromAnEarlierRender = result.current.plan

    act(() => { usePlannerStore.getState().editRide({ profile: "twisty", via: [detour] }, "Edit") })
    await act(async () => { await planFromAnEarlierRender() })

    const [request] = primaryRequests()
    expect(request?.profile).toBe("twisty")
    expect(request?.points).toHaveLength(3)
  })

  it("reports an unroutable ride instead of asking the provider for one", async () => {
    usePlannerStore.setState({ start: null, finish })
    const { result } = renderOrchestrator()

    await act(async () => { await expect(result.current.plan()).resolves.toBeNull() })

    expect(requestTripPlan).not.toHaveBeenCalled()
    expect(usePlannerStore.getState().error?.code).toBe("MISSING_WAYPOINTS")
  })

  describe("Undo and Redo replans", () => {
    it("routes the canonical restored ride, not the one that was undone", async () => {
      usePlannerStore.setState({ start, finish, profile: "balanced" })
      const { result } = renderOrchestrator()
      act(() => { usePlannerStore.getState().editRide({ profile: "twisty" }, "Pick twisty") })

      act(() => { usePlannerStore.getState().undoRideChange() })
      await act(async () => { result.current.replanAfterRideHistoryMove() })

      await waitFor(() => expect(primaryRequests()).toHaveLength(1))
      expect(primaryRequests()[0]?.profile).toBe("balanced")

      act(() => { usePlannerStore.getState().redoRideChange() })
      await act(async () => { result.current.replanAfterRideHistoryMove() })

      await waitFor(() => expect(primaryRequests()).toHaveLength(2))
      expect(primaryRequests()[1]?.profile).toBe("twisty")
    })

    it("restores a ride that has no route on screen yet", async () => {
      usePlannerStore.setState({ start, finish })
      const { result } = renderOrchestrator()
      expect(usePlannerStore.getState().plan).toBeNull()

      await act(async () => { result.current.replanAfterRideHistoryMove() })

      await waitFor(() => expect(primaryRequests()).toHaveLength(1))
    })

    it("does not ask for a route the restored ride cannot support", async () => {
      usePlannerStore.setState({ start, finish: null, mode: "destination" })
      const { result } = renderOrchestrator()

      await act(async () => { result.current.replanAfterRideHistoryMove() })

      expect(requestTripPlan).not.toHaveBeenCalled()
    })

    it("drops a coalesced edit replan that Undo has already superseded", async () => {
      vi.useFakeTimers()
      usePlannerStore.setState({ start, finish, plan: { selectedRouteId: "r", routes: [], warnings: [] } })
      const { result } = renderOrchestrator()

      act(() => { result.current.replanAfterIntentEdit() })
      act(() => { result.current.replanAfterRideHistoryMove() })
      await act(async () => { await vi.advanceTimersByTimeAsync(REPLAN_COALESCE_MS * 4) })

      expect(primaryRequests()).toHaveLength(1)
    })
  })

  describe("draft recovery replans", () => {
    it("asks for the route a restored checkpoint deliberately did not store", async () => {
      usePlannerStore.setState({ start, finish, recoveryStatus: "restored" })
      renderOrchestrator()

      await waitFor(() => expect(primaryRequests()).toHaveLength(1))
    })

    it("replans a restored ride exactly once however often the effect re-runs", async () => {
      usePlannerStore.setState({ start, finish, recoveryStatus: "restored" })
      const { rerender } = renderOrchestrator()

      await waitFor(() => expect(primaryRequests()).toHaveLength(1))
      rerender()
      act(() => { usePlannerStore.setState({ recoveryStatus: "restored" }) })
      await act(async () => { await Promise.resolve() })

      expect(primaryRequests()).toHaveLength(1)
    })

    it("leaves a recovered ride alone when it already has a route", async () => {
      usePlannerStore.setState({
        start,
        finish,
        recoveryStatus: "restored",
        plan: { selectedRouteId: "r", routes: [], warnings: [] }
      })
      renderOrchestrator()
      await act(async () => { await Promise.resolve() })

      expect(requestTripPlan).not.toHaveBeenCalled()
    })
  })

  describe("coalescing a burst of edits", () => {
    it("collapses a burst into one request built from the last edit", async () => {
      vi.useFakeTimers()
      usePlannerStore.setState({
        start,
        finish,
        plan: { selectedRouteId: "r", routes: [], warnings: [] }
      })
      const { result } = renderOrchestrator()

      act(() => {
        result.current.replanAfterIntentEdit()
        usePlannerStore.getState().editRide({ profile: "twisty" }, "Twisty")
        result.current.replanAfterIntentEdit()
        usePlannerStore.getState().editRide({ profile: "scenic" }, "Scenic")
        result.current.replanAfterIntentEdit()
      })
      await act(async () => { await vi.advanceTimersByTimeAsync(REPLAN_COALESCE_MS * 2) })

      expect(primaryRequests()).toHaveLength(1)
      expect(primaryRequests()[0]?.profile).toBe("scenic")
    })

    it("stays quiet while the rider is still composing a first ride", async () => {
      vi.useFakeTimers()
      usePlannerStore.setState({ start, finish, plan: null })
      const { result } = renderOrchestrator()

      act(() => { result.current.replanAfterIntentEdit() })
      await act(async () => { await vi.advanceTimersByTimeAsync(REPLAN_COALESCE_MS * 4) })

      expect(requestTripPlan).not.toHaveBeenCalled()
    })

    it("never fires a pending replan into an unmounted planner", async () => {
      vi.useFakeTimers()
      usePlannerStore.setState({
        start,
        finish,
        plan: { selectedRouteId: "r", routes: [], warnings: [] }
      })
      const { result, unmount } = renderOrchestrator()

      act(() => { result.current.replanAfterIntentEdit() })
      act(() => { unmount() })
      await act(async () => { await vi.advanceTimersByTimeAsync(REPLAN_COALESCE_MS * 4) })

      expect(requestTripPlan).not.toHaveBeenCalled()
    })
  })

  describe("retaining the last usable route", () => {
    it("keeps the route that was on screen so must-lock recovery can restore it", async () => {
      usePlannerStore.setState({ start, finish })
      const { result } = renderOrchestrator()
      await act(async () => { await result.current.plan() })
      await waitFor(() => expect(usePlannerStore.getState().selectedRouteId).toBe("route-primary"))

      vi.mocked(requestTripPlan).mockImplementation(async (request) => (
        request.candidateSet === "alternatives"
          ? { selectedRouteId: "", routes: [], warnings: [] }
          : plan("route-replanned")
      ))
      await act(async () => { await result.current.plan() })

      expect(result.current.previousRoute?.id).toBe("route-primary")
    })

    it("releases the older retained route when two plans run before a re-render", async () => {
      // Retention used to be decided from a captured render value. Two rider
      // actions in one tick therefore both read the pre-render value, so the
      // first retained route was never released and outlived the ride.
      usePlannerStore.setState({ start, finish })
      const { result } = renderOrchestrator()
      const planNow = result.current.plan
      routeEntityCache.merge([route("route-a"), route("route-b")])

      await act(async () => {
        usePlannerStore.setState({ selectedRouteId: "route-a" })
        const first = planNow()
        // A second action reaches the orchestrator before React re-renders.
        usePlannerStore.setState({ selectedRouteId: "route-b" })
        const second = planNow()
        await Promise.all([first, second])
      })

      expect(result.current.previousRoute?.id).toBe("route-b")
      // Only what is still retained survives an invalidate; a leak would too.
      routeEntityCache.invalidate()
      expect(routeEntityCache.get("route-a")).toBeUndefined()
      expect(routeEntityCache.get("route-b")).toBeDefined()
    })

    it("drops the retained route when the rider clears the ride", async () => {
      usePlannerStore.setState({ start, finish })
      const { result } = renderOrchestrator()
      await act(async () => { await result.current.plan() })
      await waitFor(() => expect(usePlannerStore.getState().selectedRouteId).toBe("route-primary"))
      await act(async () => { await result.current.plan() })
      expect(result.current.previousRoute).not.toBeNull()

      act(() => { result.current.releaseRetainedRoute() })

      expect(result.current.previousRoute).toBeNull()
      routeEntityCache.invalidate()
      expect(routeEntityCache.get("route-primary")).toBeUndefined()
    })
  })

  describe("cancellation and session ownership", () => {
    it("keeps a stale answer off a newer ride", async () => {
      usePlannerStore.setState({ start, finish, profile: "balanced" })
      const { result } = renderOrchestrator()
      let releaseSlow!: (value: TripPlan) => void
      vi.mocked(requestTripPlan).mockImplementationOnce(() => new Promise<TripPlan>((resolve) => {
        releaseSlow = resolve
      }))

      const slow = act(async () => { await result.current.plan() })
      await act(async () => { usePlannerStore.getState().editRide({ profile: "twisty" }, "Twisty") })
      await act(async () => { await result.current.plan() })
      releaseSlow(plan("stale-route"))
      await slow

      expect(usePlannerStore.getState().selectedRouteId).toBe("route-primary")
    })

    it("rolls the ride back to the one the visible route answers on Cancel", async () => {
      usePlannerStore.setState({ start, finish })
      const { result } = renderOrchestrator()
      await act(async () => { await result.current.plan() })
      await waitFor(() => expect(usePlannerStore.getState().status).toBe("ready"))
      const committed = usePlannerStore.getState().plan
      const committedIdentity = usePlannerStore.getState().rideHistory.identity
      act(() => { usePlannerStore.getState().editRide({ profile: "twisty" }, "Twisty") })
      expect(usePlannerStore.getState().rideHistory.identity).not.toBe(committedIdentity)

      act(() => { result.current.cancel() })

      const settled = usePlannerStore.getState()
      expect(settled.plan).toBe(committed)
      expect(settled.profile).toBe("balanced")
      expect(settled.rideHistory.identity).toBe(committedIdentity)
      expect(settled.committedRide?.identity).toBe(settled.rideHistory.identity)
    })

    it("settles a lifecycle that was still in flight when Cancel was pressed", async () => {
      usePlannerStore.setState({ start, finish })
      const { result } = renderOrchestrator()
      let signal!: AbortSignal
      vi.mocked(requestTripPlan).mockImplementationOnce((_request, _fetch, requestSignal) => {
        signal = requestSignal!
        return new Promise<TripPlan>((_resolve, reject) => {
          // The real client rejects the in-flight fetch when the session aborts.
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true }
          )
        })
      })

      const pending = act(async () => { await result.current.plan() })
      await waitFor(() => expect(usePlannerStore.getState().planningPhase).toBe("routing-primary"))
      act(() => { result.current.cancel() })
      await pending

      expect(signal.aborted).toBe(true)
      // Reported as cancelled, not silently idle: the rider stopped a run that
      // was genuinely in flight, and the deck says so.
      expect(usePlannerStore.getState().planningPhase).toBe("cancelled")
      expect(usePlannerStore.getState().isRecalculating).toBe(false)
    })

    it("surfaces a provider warning from a plan that still succeeded", async () => {
      usePlannerStore.setState({ start, finish })
      const { result, onWarning } = renderOrchestrator()
      vi.mocked(requestTripPlan).mockImplementationOnce(async () => ({
        ...plan("route-primary"),
        warnings: ["Optional elevation is unavailable."]
      }))

      await act(async () => { await result.current.plan() })

      expect(onWarning).toHaveBeenCalledWith("Optional elevation is unavailable.")
    })
  })

  it("gives every request its own loop-shaping seed", () => {
    const { result } = renderOrchestrator()

    expect([result.current.nextSeed(), result.current.nextSeed(), result.current.nextSeed()])
      .toEqual([18, 19, 20])
  })
})
