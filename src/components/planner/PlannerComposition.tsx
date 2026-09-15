"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { telemetry } from "@/lib/telemetry/client"
import { routeTelemetryProperties } from "@/lib/telemetry/route"
import type { WorkflowSpanHandle } from "@/lib/telemetry/spans"
import { PlannerDeck } from "./PlannerDeck"
import { PlannerRouteDetailsWorkspace } from "./PlannerRouteDetailsWorkspace"
import type {
  PlannerPresentationBoundary,
  PlannerRouteComparisonProps
} from "./PlannerPresentationBoundary"
import {
  openRouteDetails,
  resolveRouteDetails,
  type RouteDetailsWorkspaceState
} from "./planner-route-details-state"
import { RouteTrafficSummary } from "./RouteTrafficSummary"
import { useWorkspaceMode } from "./workspace/use-workspace-mode"
import { RouteDecisionRail } from "./v2/RouteDecisionRail"
import { RideAdvisor } from "./v2/RideAdvisor"
import { RideIntentFeedback } from "./RideIntentFeedback"

/** Module-scope so the default keeps a stable identity across renders. */
const NO_ROUTES: PlannerRouteComparisonProps["routes"] = []

export type PlannerCompositionProps = PlannerPresentationBoundary

/**
 * Planner-only presentation boundary. Route choice and route inspection are
 * deliberately separate workspaces: candidates are the primary task after a
 * plan, while the dense preparation surface appears only when the rider asks
 * for details. Gravel Goblin remains independent of RouteComparison so it can
 * scout before routing and offer an actionable second opinion after routing.
 *
 * This component knows only its presentation model and its commands. It reads
 * no store, so nothing it draws can disagree with what the container decided.
 * Its only own state is which route the rider opened for inspection.
 */
export function PlannerComposition({ model, commands }: PlannerCompositionProps) {
  const { deck: viewModel, comparison, planWarnings, advisorOrigin, bootstrapPending } = model
  const {
    deck: deckCommands,
    addAdvisorStop: onAddAdvisorStop,
    routeWithAdvisorStop: onRouteWithAdvisorStop,
    planAdvisorRide: onPlanAdvisorRide
  } = commands
  const workspaceMode = useWorkspaceMode()
  const [details, setDetails] = useState<RouteDetailsWorkspaceState | null>(null)
  const comparisonSpanRef = useRef<WorkflowSpanHandle | null>(null)
  const comparisonActiveRef = useRef(false)
  const activeComparisonKeyRef = useRef<string | null>(null)
  const comparisonSnapshotRef = useRef<PlannerRouteComparisonProps | null>(null)
  const comparisonKey = comparison
    ? comparison.routes.map((route) => route.id).join(",")
    : null

  const closeComparison = useCallback((outcome: "selected" | "backed-out" | "abandoned") => {
    if (!comparisonActiveRef.current) return
    comparisonActiveRef.current = false
    const activeSpan = comparisonSpanRef.current
    comparisonSpanRef.current = null
    const snapshot = comparisonSnapshotRef.current
    const routes = snapshot?.routes ?? []
    const selected = routes.find((route) => route.id === snapshot?.selectedId) ?? routes[0]
    try {
      telemetry.capture("route_comparison_ended", {
        ...(selected ? routeTelemetryProperties(selected, routes) : {
          candidate_count: Math.min(20, routes.length),
          provider_set: "unknown",
          distance_band: "unknown",
          duration_band: "unknown",
          detour_band: "unknown",
          waypoint_count_band: "unknown",
          surface_mix_band: "unknown",
          traffic_evidence_present: false,
          selected_candidate_role: "unknown"
        }),
        comparison_outcome: outcome
      })
      activeSpan?.end(outcome === "abandoned" ? "abandoned" : "success", {
        candidate_count: Math.min(20, routes.length),
        comparison_outcome: outcome
      })
    } catch {
      // Comparison telemetry is optional and must never block route choice.
    }
  }, [])

  useEffect(() => {
    if (
      activeComparisonKeyRef.current !== null
      && activeComparisonKeyRef.current !== comparisonKey
    ) {
      // Close against the previous snapshot before replacing it, so a replan
      // cannot attribute the new candidate set to the abandoned comparison.
      closeComparison("abandoned")
    }
    comparisonSnapshotRef.current = comparison
    activeComparisonKeyRef.current = comparisonKey
    if (!comparisonKey) {
      return
    }
    if (comparisonActiveRef.current) return
    const snapshot = comparisonSnapshotRef.current
    if (!snapshot) return
    comparisonActiveRef.current = true
    const routes = snapshot.routes
    const selected = routes.find((route) => route.id === snapshot.selectedId) ?? routes[0]
    try {
      telemetry.capture("route_comparison_started", selected
        ? routeTelemetryProperties(selected, routes)
        : {
          candidate_count: Math.min(20, routes.length),
          provider_set: "unknown",
          distance_band: "unknown",
          duration_band: "unknown",
          detour_band: "unknown",
          waypoint_count_band: "unknown",
          surface_mix_band: "unknown",
          traffic_evidence_present: false,
          selected_candidate_role: "unknown"
        })
      comparisonSpanRef.current = telemetry.startWorkflow("route_comparison", {
        candidate_count: Math.min(20, routes.length)
      })
    } catch {
      // Comparison telemetry is optional and must never block route choice.
    }
  }, [closeComparison, comparison, comparisonKey])

  useEffect(() => () => closeComparison("abandoned"), [closeComparison])
  // Clearing the plan ends the workspace. Route ids are derived from profile and
  // geometry, so replanning the same trip yields the same ids — a details state
  // that survived the gap would silently reopen over the route-choice stage
  // instead of letting the rider choose again. Reset during render rather than
  // in an effect so the stale workspace can never paint first.
  if (!comparison && details) setDetails(null)
  // The details workspace follows the plan's own selection, not just the
  // control that opened it. Selection can also move from the map, and a
  // workspace left pointing at the previous route would keep its directions,
  // preparation actions and Start ride button aimed at a route the rider is no
  // longer looking at.
  const selectedDetailsRoute = comparison
    ? resolveRouteDetails(details, comparison.routes, comparison.selectedId)
    : null
  const selectedRoute = comparison
    ? comparison.routes.find((route) => route.id === comparison.selectedId) ?? null
    : null
  const showingDetails = Boolean(comparison && selectedDetailsRoute)
  // During a replan/failing edit OpenGravel deliberately retains the last
  // usable route on screen. It is visual recovery evidence, not an answer to
  // the new ride intent. Gravel Goblin's prompt says supplied candidates are
  // the only routes that exist, so never feed that retained route to it while
  // canonical planner identity says the route is stale.
  const advisorGroundingCurrent = !viewModel.rideHistory.hasUnappliedChange

  const selectRoute = (id: string) => {
    closeDetails()
    comparison?.onSelect(id)
  }

  const closeDetails = () => {
    if (!details) return
    try {
      telemetry.capture("panel_closed", {
        surface: "plan",
        control: "unknown",
        panel: "route-details"
      })
    } catch {
      // Route choice remains available when observability is blocked.
    }
    setDetails(null)
  }

  const openDetails = (id: string) => {
    if (!comparison) return
    comparison.onSelect(id)
    const selected = comparison.routes.find((route) => route.id === id)
    if (selected) {
      try {
        telemetry.capture("panel_opened", {
          surface: "plan",
          control: "unknown",
          panel: "route-details"
        })
        const properties = routeTelemetryProperties(selected, comparison.routes)
        telemetry.capture("route_detail_opened", properties)
        telemetry.capture("route_explanation_opened", {
          ...properties,
          explanation_type: "preparation"
        })
      } catch {
        // Route details remain available when observability is blocked.
      }
    }
    setDetails(openRouteDetails(id, comparison.routes))
  }

  /**
   * Bootstrap is *reported*, never enforced by making the deck unusable.
   *
   * `inert` here swallowed the rider's first keystrokes: the composer accepted
   * focus-less key events into a void, so someone who started describing their
   * ride the instant the app painted lost the text and was left with a submit
   * button that stayed disabled until they typed it again. Nothing was told to
   * them, because inert has no visible state.
   *
   * Nothing needed that protection. Bootstrap is only unsafe if a rider edit
   * can be overwritten by a checkpoint that resolves after it, and the store
   * already forbids exactly that: `restoreRide` adopts a checkpoint only while
   * the intent identity is still the one recovery started with, and reports
   * `superseded` otherwise. Rider defaults are seeded only into a semantically
   * pristine ride. The rider's ride wins on its own terms, so the deck stays
   * interactive and only says that it is still settling.
   */
  return (
    <div
      aria-busy={bootstrapPending || undefined}
      data-workspace-mode={workspaceMode}
      style={{ display: "contents" }}
    >
      <PlannerDeck viewModel={viewModel} commands={deckCommands}>
        {comparison && !showingDetails ? (
          <RouteDecisionRail
            routes={comparison.routes}
            selectedId={comparison.selectedId}
            onSelect={selectRoute}
            onOpenDetails={openDetails}
          />
        ) : null}

        <RouteTrafficSummary route={selectedRoute} />

        {/* Route choice stays the primary task after a plan (ADR 0013), so the
            ride summary reports underneath it rather than pushing it down. */}
        <RideIntentFeedback viewModel={viewModel} commands={deckCommands} />

        {onAddAdvisorStop && !showingDetails && advisorGroundingCurrent ? (
          <RideAdvisor
            routes={comparison?.routes ?? NO_ROUTES}
            selectedRouteId={comparison?.selectedId ?? ""}
            warnings={planWarnings}
            resultRevision={viewModel.ui.resultRevision}
            origin={advisorOrigin}
            onAddStop={onAddAdvisorStop}
            {...(onRouteWithAdvisorStop ? { onRouteWithStop: onRouteWithAdvisorStop } : {})}
            {...(comparison ? { onSelectRoute: selectRoute } : {})}
            {...(onPlanAdvisorRide ? { onPlanRide: onPlanAdvisorRide } : {})}
          />
        ) : null}

        {comparison && selectedDetailsRoute ? (
          <PlannerRouteDetailsWorkspace
            comparison={comparison}
            route={selectedDetailsRoute}
            onBack={closeDetails}
          />
        ) : null}
      </PlannerDeck>
    </div>
  )
}
