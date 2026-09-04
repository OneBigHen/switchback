"use client"

import { ArrowLeft } from "@phosphor-icons/react"
import { useEffect, useState, type ComponentProps } from "react"
import type { ProposedRide, ProposedStop } from "@/lib/advice/contracts"
import { PlannerDeck } from "./PlannerDeck"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "./PlannerDeckViewModel"
import { RouteComparison } from "./RouteComparison"
import { RouteDecisionRail } from "./v2/RouteDecisionRail"
import { RideAdvisor } from "./v2/RideAdvisor"

type RouteComparisonProps = ComponentProps<typeof RouteComparison>

/** Module-scope so the default keeps a stable identity across renders. */
const NO_WARNINGS: string[] = []
const NO_ROUTES: RouteComparisonProps["routes"] = []

export interface PlannerCompositionProps {
  viewModel: PlannerDeckViewModel
  commands: PlannerDeckCommands
  comparison: RouteComparisonProps | null
  /** Warnings from the current plan, so the advisor cannot contradict them. */
  planWarnings?: string[]
  /** Accept an advisor-proposed stop without losing its along-route evidence. */
  onAddAdvisorStop?(stop: ProposedStop): void
  /** Accept a whole advisor-proposed ride into the planner's own controls. */
  onPlanAdvisorRide?(ride: ProposedRide): void
  /** Explicit planner start, so the advisor can search places before a route exists. */
  advisorOrigin?: { lat: number; lon: number; label?: string } | null
}

/**
 * Planner-only composition boundary. Route choice and route inspection are
 * deliberately separate workspaces: candidates are the primary task after a
 * plan, while the dense preparation surface appears only when the rider asks
 * for details. The advisor remains independent of RouteComparison so it can be
 * a builder before routing and a compact co-pilot after routing.
 */
export function PlannerComposition({
  viewModel,
  commands,
  comparison,
  planWarnings = NO_WARNINGS,
  onAddAdvisorStop,
  onPlanAdvisorRide,
  advisorOrigin
}: PlannerCompositionProps) {
  const [detailsRouteId, setDetailsRouteId] = useState<string | null>(null)
  const routeSetKey = comparison?.routes.map((route) => route.id).join("|") ?? ""

  // A new candidate set is a new decision. Never strand the rider inside the
  // previous plan's detail surface after a replan.
  useEffect(() => {
    setDetailsRouteId(null)
  }, [routeSetKey])

  const selectedDetailsRoute = comparison && detailsRouteId
    ? comparison.routes.find((route) => route.id === detailsRouteId) ?? null
    : null
  const showingDetails = Boolean(comparison && selectedDetailsRoute)

  const selectRoute = (id: string) => {
    setDetailsRouteId(null)
    comparison?.onSelect(id)
  }

  const openDetails = (id: string) => {
    comparison?.onSelect(id)
    setDetailsRouteId(id)
  }

  return (
    <PlannerDeck viewModel={viewModel} commands={commands}>
      {comparison && !showingDetails ? (
        <RouteDecisionRail
          routes={comparison.routes}
          selectedId={comparison.selectedId}
          onSelect={selectRoute}
          onOpenDetails={openDetails}
        />
      ) : null}

      {onAddAdvisorStop && !showingDetails ? (
        <RideAdvisor
          routes={comparison?.routes ?? NO_ROUTES}
          selectedRouteId={comparison?.selectedId ?? ""}
          warnings={planWarnings}
          origin={advisorOrigin ?? null}
          onAddStop={onAddAdvisorStop}
          {...(onPlanAdvisorRide ? { onPlanRide: onPlanAdvisorRide } : {})}
        />
      ) : null}

      {comparison && selectedDetailsRoute ? (
        <section className="planner-route-details" aria-label="Route details workspace">
          <header className="planner-route-details__header">
            <button type="button" aria-label="Back to route choices" onClick={() => setDetailsRouteId(null)}>
              <ArrowLeft weight="bold" aria-hidden="true" />
              <span>Route options</span>
            </button>
            <span className="planner-route-details__identity">
              <small>Route details</small>
              <strong>{selectedDetailsRoute.name}</strong>
            </span>
          </header>
          <RouteComparison
            {...comparison}
            selectedId={selectedDetailsRoute.id}
            showRouteChoices={false}
          />
        </section>
      ) : null}
    </PlannerDeck>
  )
}
