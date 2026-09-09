"use client"

import { useState } from "react"
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
    planAdvisorRide: onPlanAdvisorRide
  } = commands
  const [details, setDetails] = useState<RouteDetailsWorkspaceState | null>(null)
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
  const showingDetails = Boolean(comparison && selectedDetailsRoute)
  // During a replan/failing edit Switchback deliberately retains the last
  // usable route on screen. It is visual recovery evidence, not an answer to
  // the new ride intent. Gravel Goblin's prompt says supplied candidates are
  // the only routes that exist, so never feed that retained route to it while
  // canonical planner identity says the route is stale.
  const advisorGroundingCurrent = !viewModel.rideHistory.hasUnappliedChange

  const selectRoute = (id: string) => {
    setDetails(null)
    comparison?.onSelect(id)
  }

  const openDetails = (id: string) => {
    if (!comparison) return
    comparison.onSelect(id)
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

        {/* Route choice stays the primary task after a plan (ADR 0013), so the
            ride summary reports underneath it rather than pushing it down. */}
        <RideIntentFeedback viewModel={viewModel} commands={deckCommands} />

        {onAddAdvisorStop && !showingDetails && advisorGroundingCurrent ? (
          <RideAdvisor
            routes={comparison?.routes ?? NO_ROUTES}
            selectedRouteId={comparison?.selectedId ?? ""}
            warnings={planWarnings}
            origin={advisorOrigin}
            onAddStop={onAddAdvisorStop}
            {...(comparison ? { onSelectRoute: selectRoute } : {})}
            {...(onPlanAdvisorRide ? { onPlanRide: onPlanAdvisorRide } : {})}
          />
        ) : null}

        {comparison && selectedDetailsRoute ? (
          <PlannerRouteDetailsWorkspace
            comparison={comparison}
            route={selectedDetailsRoute}
            onBack={() => setDetails(null)}
          />
        ) : null}
      </PlannerDeck>
    </div>
  )
}
