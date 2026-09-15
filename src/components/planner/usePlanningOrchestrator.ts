"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { LatestRequestGate } from "@/lib/client/latest-request"
import { createPlanningSessionController } from "@/lib/client/planning-session-controller"
import { routeEntityCache } from "@/lib/client/route-entity-cache"
import { buildCanonicalRideRequest } from "@/lib/planner/canonical-ride-request"
import type { TripPlan, TripPlanRequest } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"
import { telemetry as defaultTelemetry, type TelemetryController } from "@/lib/telemetry/client"
import {
  latencyProperties,
  routeRequestTelemetryProperties,
  routeTelemetryProperties,
  telemetryFailureClass,
  telemetryCountBand
} from "@/lib/telemetry/route"
import type { TelemetryErrorProperties, TelemetryFailureClass, TelemetryRouteProperties, TelemetryRouteSource } from "@/lib/telemetry/events"
import type { WorkflowSpanHandle, WorkflowName } from "@/lib/telemetry/spans"
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
  runTripPlan(request: TripPlanRequest, options?: PlanningRunTelemetryOptions): Promise<TripPlan | null>
  /** Plan the canonical ride exactly as it stands right now. */
  plan(): Promise<TripPlan | null>
  /** Coalesced replan after a rider edit to a ride that already has a route. */
  replanAfterIntentEdit(): void
  /** Immediate replan after Undo/Redo restored a different ride. */
  replanAfterRideHistoryMove(): void
  /** Rider-visible Cancel: settle the session and roll the ride back. */
  cancel(): void
  /** Mark the exact point at which the rider entered live guidance. */
  markNavigationStarted(route: PlannedRoute): void
  /** Drop the retained previous route when the ride itself is cleared. */
  releaseRetainedRoute(): void
}

interface PlanningOrchestratorOptions {
  /** Provider warnings from a plan that still succeeded. Must be stable. */
  onWarning(message: string): void
  /** Injectable observability seam; the production default is the singleton controller. */
  telemetry?: TelemetryController
}

export interface PlanningRunTelemetryOptions {
  /** The product surface that initiated this request. */
  source?: TelemetryRouteSource
  /** Set to null for requests that belong to another workflow span. */
  workflow?: WorkflowName | null
}

function emptyRouteTelemetryProperties(
  request: TripPlanRequest,
  source: TelemetryRouteSource,
  candidateCount: number
): TelemetryRouteProperties {
  return {
    ...routeRequestTelemetryProperties(request, source),
    provider_set: "unknown",
    distance_band: "unknown",
    duration_band: "unknown",
    detour_band: "unknown",
    candidate_count: Math.min(20, Math.max(0, candidateCount)),
    surface_mix_band: "unknown",
    traffic_evidence_present: false,
    selected_candidate_role: "unknown"
  }
}

function plannerErrorProperties(errorClass: TelemetryFailureClass): TelemetryErrorProperties {
  const cancelled = errorClass === "cancelled"
  const inputBlocked = errorClass === "missing-input" || errorClass === "no-route"
  return {
    error_class: errorClass,
    feature: "planner",
    surface: "planner",
    recoverable: !cancelled,
    recovery_path: cancelled ? "none" : inputBlocked ? "edit-input" : "retry",
    user_impact: cancelled ? "none" : inputBlocked ? "blocked" : "degraded"
  }
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
export function usePlanningOrchestrator({
  onWarning,
  telemetry: telemetryController = defaultTelemetry
}: PlanningOrchestratorOptions): PlanningOrchestrator {
  const [session] = useState(() => createPlanningSessionController({
    getPlanner: usePlannerStore.getState
  }))
  const gate = session.gate
  const recoveryStatus = usePlannerStore((state) => state.recoveryStatus)
  const rideHistorySequence = usePlannerStore((state) => state.rideHistory.sequence)
  const visiblePlan = usePlannerStore((state) => state.plan)

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
  const plannerOpenedRef = useRef(false)
  const presentedPlanKeyRef = useRef<string | null>(null)
  const latestPlanTelemetryRef = useRef<{
    source: TelemetryRouteSource
    routeMode: "destination" | "loop" | "unknown"
  }>({ source: "unknown", routeMode: "unknown" })
  const navigationSpanRef = useRef<WorkflowSpanHandle | null>(null)

  const nextSeed = useCallback(() => ++loopSeed.current, [])

  const releaseRetainedRoute = useCallback(() => {
    if (retainedRouteIdRef.current) routeEntityCache.release(retainedRouteIdRef.current)
    retainedRouteIdRef.current = null
    setPreviousRouteId(null)
  }, [])

  const runTripPlan = useCallback(async (
    request: TripPlanRequest,
    options: PlanningRunTelemetryOptions = {}
  ): Promise<TripPlan | null> => {
    const source = options.source ?? request.source ?? "manual"
    const workflow = options.workflow === undefined
      ? source === "free-ride" ? null : "planner_to_first_routes"
      : options.workflow
    const requestProperties = routeRequestTelemetryProperties(request, source)
    latestPlanTelemetryRef.current = {
      source,
      routeMode: requestProperties.route_mode
    }
    const startedAt = Date.now()
    let workflowSpan: WorkflowSpanHandle | null = null
    let navigationSpan: WorkflowSpanHandle | null = null
    const previousNavigationSpan = navigationSpanRef.current
    navigationSpanRef.current = null
    try {
      previousNavigationSpan?.abandon({ replaced_by_new_plan: true })
      telemetryController.capture("route_plan_requested", requestProperties)
      if (workflow) {
        workflowSpan = telemetryController.startWorkflow(workflow, {
          route_mode: requestProperties.route_mode,
          route_source: requestProperties.route_source
        })
      }
      navigationSpan = telemetryController.startWorkflow("planner_to_navigation", {
        route_mode: requestProperties.route_mode,
        route_source: requestProperties.route_source
      })
      navigationSpanRef.current = navigationSpan
      telemetryController.capture("provider_request_started", {
        ...requestProperties,
        operation: "route-plan-primary",
        provider: "unknown"
      })
    } catch {
      // Telemetry must never prevent a route request from starting.
    }

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
    const result = await session.run(request, onWarning)
    const latency = Date.now() - startedAt
    const selected = result?.routes.find((route) => route.id === result.selectedRouteId) ?? result?.routes[0]

    if (result) {
      const routeProperties = selected
        ? routeTelemetryProperties(selected, result.routes, {
          routeMode: requestProperties.route_mode,
          routeSource: source
        })
        : emptyRouteTelemetryProperties(request, source, result.routes.length)
      const provider = selected?.provider === "graphhopper" || selected?.provider === "valhalla"
        ? selected.provider
        : "unknown"
      const successProperties = {
        ...routeProperties,
        ...latencyProperties(latency),
        success: true as const
      }
      try {
        telemetryController.capture("provider_request_completed", {
          ...routeProperties,
          operation: "route-plan-primary",
          provider
        })
        telemetryController.capture("route_plan_succeeded", successProperties)
        if (source === "replan") telemetryController.capture("route_replanned", successProperties)
        workflowSpan?.end("success", {
          route_mode: requestProperties.route_mode,
          route_source: source,
          candidate_count: Math.min(20, result.routes.length),
          success: true,
          latency_ms: Math.max(0, Math.round(latency))
        })
      } catch {
        // Telemetry must never turn a successful route into an application error.
      }
    } else {
      const failure = usePlannerStore.getState().error
      const failureClass = telemetryFailureClass(failure?.code)
      const failureProperties = {
        ...requestProperties,
        ...latencyProperties(latency),
        success: false as const,
        failure_class: failureClass
      }
      try {
        telemetryController.capture("provider_request_failed", {
          ...failureProperties,
          operation: "route-plan-primary",
          provider: "unknown"
        })
        if (failureClass === "provider-timeout") {
          telemetryController.capture("provider_timeout", {
            ...failureProperties,
            operation: "route-plan-primary",
            provider: "unknown"
          })
        }
        telemetryController.capture("app_error", plannerErrorProperties(failureClass))
        telemetryController.capture("route_plan_failed", failureProperties)
        if (failureClass === "cancelled") {
          workflowSpan?.cancel({
            route_mode: requestProperties.route_mode,
            route_source: source,
            failure_class: failureClass,
            latency_ms: Math.max(0, Math.round(latency))
          })
        } else {
          workflowSpan?.fail(failureClass, {
            route_mode: requestProperties.route_mode,
            route_source: source,
            latency_ms: Math.max(0, Math.round(latency))
          })
        }
        if (navigationSpanRef.current === navigationSpan) {
          navigationSpanRef.current = null
        }
        navigationSpan?.fail(failureClass, {
          route_mode: requestProperties.route_mode,
          route_source: source,
          latency_ms: Math.max(0, Math.round(latency))
        })
      } catch {
        // Telemetry must never turn a handled routing failure into an exception.
      }
    }
    return result
  }, [onWarning, session, telemetryController])

  const plan = useCallback(async (): Promise<TripPlan | null> => {
    const current = usePlannerStore.getState()
    const source: TelemetryRouteSource = current.plan ? "replan" : "manual"
    try {
      const request = buildCanonicalRideRequest(getRideIntent(current), { seed: nextSeed() })
      try {
        telemetryController.capture("planner_input_completed", {
          ...routeRequestTelemetryProperties(request, source),
          completion_method: "unknown"
        })
      } catch {
        // Telemetry must never change the planner's request path.
      }
      return await runTripPlan(request, { source })
    } catch (caught) {
      try {
        telemetryController.capture("app_error", plannerErrorProperties("missing-input"))
        telemetryController.capture("route_plan_failed", {
          route_mode: current.mode === "loop" ? "loop" : current.start && current.finish ? "destination" : "unknown",
          route_source: source,
          waypoint_count_band: telemetryCountBand(
            current.mode === "loop"
              ? current.start ? 1 + current.via.length : current.via.length
              : [current.start, ...current.via, current.finish].filter(Boolean).length
          ),
          success: false,
          failure_class: "missing-input"
        })
      } catch {
        // Telemetry must never change the planner's actionable error path.
      }
      current.failRouting({
        code: "MISSING_WAYPOINTS",
        message: caught instanceof Error ? caught.message : "Choose the points for this ride first."
      })
      return null
    }
  }, [nextSeed, runTripPlan, telemetryController])

  const markNavigationStarted = useCallback((route: PlannedRoute) => {
    const navigationSpan = navigationSpanRef.current
    navigationSpanRef.current = null
    const state = usePlannerStore.getState()
    try {
      const properties = routeTelemetryProperties(route, [route], {
        routeMode: state.mode,
        routeSource: latestPlanTelemetryRef.current.source
      })
      telemetryController.capture("navigation_started", properties)
      navigationSpan?.end("success", {
        route_mode: state.mode,
        route_source: latestPlanTelemetryRef.current.source,
        selected_candidate_role: properties.selected_candidate_role ?? "unknown",
        navigation_started: true
      })
    } catch {
      // Live guidance must remain available when telemetry is blocked.
      try {
        navigationSpan?.end("success", { navigation_started: true })
      } catch {
        // A failing telemetry span is also non-critical.
      }
    }
  }, [telemetryController])

  useEffect(() => {
    if (plannerOpenedRef.current) return
    plannerOpenedRef.current = true
    try {
      telemetryController.capture("planner_opened", { surface: "plan" })
    } catch {
      // Telemetry must never prevent the planner from mounting.
    }
  }, [telemetryController])

  useEffect(() => {
    if (!visiblePlan || visiblePlan.routes.length === 0) return
    const key = `${visiblePlan.planningId ?? "plan"}:${visiblePlan.routes.map((route) => route.id).join(",")}`
    if (presentedPlanKeyRef.current === key) return
    presentedPlanKeyRef.current = key
    const routes = routeEntityCache.getMany(visiblePlan.routes.map((route) => route.id))
    const selected = routes.find((route) => route.id === visiblePlan.selectedRouteId) ?? routes[0]
    try {
      telemetryController.capture("route_candidates_presented", selected
        ? routeTelemetryProperties(selected, routes, {
          routeMode: latestPlanTelemetryRef.current.routeMode,
          routeSource: latestPlanTelemetryRef.current.source
        })
        : {
          route_mode: latestPlanTelemetryRef.current.routeMode,
          route_source: latestPlanTelemetryRef.current.source,
          candidate_count: Math.min(20, visiblePlan.routes.length),
          provider_set: "unknown",
          distance_band: "unknown",
          duration_band: "unknown",
          detour_band: "unknown",
          waypoint_count_band: "unknown",
          surface_mix_band: "unknown",
          traffic_evidence_present: false,
          selected_candidate_role: "unknown"
        })
    } catch {
      // A malformed cached route must not interfere with the planner surface.
    }
  }, [visiblePlan, telemetryController])

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
      const selected = state.selectedRouteId ? routeEntityCache.get(state.selectedRouteId) : undefined
      if (!selected) return
      try {
        telemetryController.capture("route_candidate_selected", routeTelemetryProperties(
          selected,
          state.plan ? routeEntityCache.getMany(state.plan.routes.map((route) => route.id)) : [selected],
          {
            routeMode: state.mode,
            routeSource: latestPlanTelemetryRef.current.source
          }
        ))
      } catch {
        // Selection remains authoritative even when observability is blocked.
      }
    }
  }), [gate, telemetryController])

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
    const navigationSpan = navigationSpanRef.current
    navigationSpanRef.current = null
    try {
      navigationSpan?.abandon({ planner_unmounted: true })
    } catch {
      // Telemetry must never block planner teardown.
    }
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
    markNavigationStarted,
    releaseRetainedRoute
  }
}
