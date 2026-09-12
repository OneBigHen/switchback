"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { LatestRequestGate } from "@/lib/client/latest-request"
import { createPlanningSessionController } from "@/lib/client/planning-session-controller"
import { routeEntityCache } from "@/lib/client/route-entity-cache"
import { buildCanonicalRideRequest } from "@/lib/planner/canonical-ride-request"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"
import { getRideIntent, usePlannerStore } from "@/stores/planner-store"

/** Bursts of ride edits collapse into one route request. */
export const REPLAN_COALESCE_MS = 180

export interface PlanningOrchestrator {
  /**
   * The request-generation fence. Callers that change the ride invalidate it so
   * work already in flight can never land on the newer ride.
   */
  readonly gate: LatestRequestGate
  /**
   * The last usable route, retained across a replan so must-lock recovery can
   * put the rider back on it. Not an answer to the current ride.
   */
  readonly previousRoute: PlannedRoute | null
  /** Monotonic loop-shaping seed; one per request. */
  nextSeed(): number
  /** Plan an already-built request (imports, reroutes, free ride, sculpting). */
  runTripPlan(request: TripPlanRequest): Promise<TripPlan | null>
  /** Plan the canonical ride exactly as it stands right now. */
  plan(): Promise<TripPlan | null>
  /** Coalesced replan after a rider edit to a ride that already has a route. */
  replanAfterIntentEdit(): void
  /** Immediate replan after Undo/Redo restored a different ride. */
  replanAfterRideHistoryMove(): void
  /** Rider-visible Cancel: settle the session and roll the ride back. */
  cancel(): void
  /** Drop the retained previous route when the ride itself is cleared. */
  releaseRetainedRoute(): void
}

interface PlanningOrchestratorOptions {
  /** Provider warnings from a plan that still succeeded. Must be stable. */
  onWarning(message: string): void
}

/**
 * Owns the planning lifecycle mechanics: request construction, session
 * ownership, cancellation, coalescing, previous-route retention, and the
 * replans that history recovery and draft recovery trigger.
 *
 * It is deliberately **not** a source of truth. Every decision here is made
 * from `usePlannerStore.getState()` at the moment it is made, so a callback
 * that outlived its render can never plan a ride the rider has already left.
 * The store stays the single authority for the ride; this hook only decides
 * when to ask, and guarantees at most one live answer.
 */
export function usePlanningOrchestrator({ onWarning }: PlanningOrchestratorOptions): PlanningOrchestrator {
  const [session] = useState(() => createPlanningSessionController({
    getPlanner: usePlannerStore.getState
  }))
  const gate = session.gate
  const recoveryStatus = usePlannerStore((state) => state.recoveryStatus)
  const rideHistorySequence = usePlannerStore((state) => state.rideHistory.sequence)

  const [previousRouteId, setPreviousRouteId] = useState<string | null>(null)
  /**
   * The retained id is read back inside `runTripPlan`, which two rider actions
   * can reach before React re-renders. A captured `previousRouteId` would still
   * read `null` on the second call and leak the first retained route, so the
   * ref — not the render value — is what retention is decided from.
   */
  const retainedRouteIdRef = useRef<string | null>(null)
  const replanTimerRef = useRef<number | null>(null)
  const loopSeed = useRef(17)

  const nextSeed = useCallback(() => ++loopSeed.current, [])

  const releaseRetainedRoute = useCallback(() => {
    if (retainedRouteIdRef.current) routeEntityCache.release(retainedRouteIdRef.current)
    retainedRouteIdRef.current = null
    setPreviousRouteId(null)
  }, [])

  const runTripPlan = useCallback(async (request: TripPlanRequest): Promise<TripPlan | null> => {
    // Keep the previous route around for the must-lock recovery panel: when a
    // must road-lock cannot be satisfied, the rider can restore the route that
    // existed before this replan.
    const current = usePlannerStore.getState()
    const existingId = current.selectedRouteId ?? current.plan?.routes[0]?.id
    const existing = existingId ? routeEntityCache.get(existingId) ?? null : null
    const retained = retainedRouteIdRef.current
    if (retained && retained !== existing?.id) {
      routeEntityCache.release(retained)
      retainedRouteIdRef.current = null
      setPreviousRouteId(null)
    }
    if (existing) {
      routeEntityCache.retain(existing.id)
      retainedRouteIdRef.current = existing.id
      setPreviousRouteId(existing.id)
    }
    return session.run(request, onWarning)
  }, [onWarning, session])

  const plan = useCallback(async (): Promise<TripPlan | null> => {
    const current = usePlannerStore.getState()
    try {
      return await runTripPlan(buildCanonicalRideRequest(getRideIntent(current), { seed: nextSeed() }))
    } catch (caught) {
      current.failRouting({
        code: "MISSING_WAYPOINTS",
        message: caught instanceof Error ? caught.message : "Choose the points for this ride first."
      })
      return null
    }
  }, [nextSeed, runTripPlan])

  const clearPendingReplan = useCallback(() => {
    if (replanTimerRef.current === null) return
    window.clearTimeout(replanTimerRef.current)
    replanTimerRef.current = null
  }, [])

  /**
   * Undo and redo replan whenever the restored ride can be routed at all, not
   * only when a route is already on screen — the point of undoing a bad change
   * is to get the previous ride back, drawn.
   */
  const replanAfterRideHistoryMove = useCallback(() => {
    clearPendingReplan()
    const current = usePlannerStore.getState()
    if (!current.start) return
    if (current.mode === "destination" && !current.finish) return
    void plan()
  }, [clearPendingReplan, plan])

  /**
   * A ride edit only replans when there is already a route to improve on: with
   * no route yet the rider is still composing, and planning under them would
   * be noise. Bursts of edits (a preset, then a toggle, then another) collapse
   * into one request instead of racing each other to the provider.
   */
  const replanAfterIntentEdit = useCallback(() => {
    const current = usePlannerStore.getState()
    if (!current.plan || !current.start) return
    clearPendingReplan()
    replanTimerRef.current = window.setTimeout(() => {
      replanTimerRef.current = null
      const latest = usePlannerStore.getState()
      if (latest.plan && latest.start) void plan()
    }, REPLAN_COALESCE_MS)
  }, [clearPendingReplan, plan])

  /**
   * Selecting a displayed route is newer rider intent even though it does not
   * change the RideIntent identity. Every manual selection surface — route
   * cards, map ribbons, advisor choices, and future selectors — writes through
   * the same canonical store command, so fence provider ownership here instead
   * of requiring each surface to remember a private request gate.
   *
   * Zustand listeners run synchronously with the store update. Invalidating at
   * this authority boundary therefore aborts/fences an older provider answer
   * before that answer can commit over the route the rider just chose.
   */
  useEffect(() => usePlannerStore.subscribe((state, previous) => {
    if (state.selectionSource !== "user") return
    if (
      previous.selectionSource !== "user"
      || state.selectedRouteId !== previous.selectedRouteId
    ) {
      gate.invalidate()
    }
  }), [gate])

  /**
   * A recovered ride is authored intent, not a stored answer: the checkpoint
   * deliberately keeps no route geometry. So once recovery lands, ask for the
   * route again — otherwise "refresh restores your ride" would hand the rider
   * back their inputs and a blank map.
   */
  const recoveredRideRef = useRef<string | null>(null)
  useEffect(() => {
    if (recoveryStatus !== "restored") return
    const current = usePlannerStore.getState()
    if (recoveredRideRef.current === current.rideHistory.identity) return
    if (current.plan || current.status !== "idle" || !current.start) return
    if (current.mode === "destination" && !current.finish) return
    recoveredRideRef.current = current.rideHistory.identity
    // Retaining the outgoing route is part of asking for a route, so the
    // request unavoidably starts a render. Guarded by the identity above, this
    // runs at most once per restored ride.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a restored ride must be re-routed
    void plan()
    // `plan` reads the committed store value; re-running on its identity would
    // replan the same recovered ride twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveryStatus, rideHistorySequence])

  // Declared after the callbacks that own the timer so a pending replan is
  // dropped with the planner rather than firing into an unmounted tree.
  useEffect(() => () => {
    clearPendingReplan()
    session.invalidate()
  }, [clearPendingReplan, session])

  return {
    gate,
    previousRoute: previousRouteId ? routeEntityCache.get(previousRouteId) ?? null : null,
    nextSeed,
    runTripPlan,
    plan,
    replanAfterIntentEdit,
    replanAfterRideHistoryMove,
    cancel: session.cancel,
    releaseRetainedRoute
  }
}
