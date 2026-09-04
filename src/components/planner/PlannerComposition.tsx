"use client"

import type { ComponentProps } from "react"
import { PlannerDeck } from "./PlannerDeck"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "./PlannerDeckViewModel"
import { RouteComparison } from "./RouteComparison"
import { RouteDecisionRail } from "./v2/RouteDecisionRail"
import { RideAdvisor } from "./v2/RideAdvisor"
import type { ProposedRide, ProposedStop } from "@/lib/advice/contracts"

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
 * Planner-only composition boundary. The advisor is deliberately independent
 * of RouteComparison: before routing it is the AI ride builder; after routing
 * the same component becomes the route advisor and second-opinion surface.
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
  return (
    <PlannerDeck viewModel={viewModel} commands={commands}>
      {comparison ? (
        <RouteDecisionRail
          routes={comparison.routes}
          selectedId={comparison.selectedId}
          onSelect={comparison.onSelect}
        />
      ) : null}

      {onAddAdvisorStop ? (
        <RideAdvisor
          routes={comparison?.routes ?? NO_ROUTES}
          selectedRouteId={comparison?.selectedId ?? ""}
          warnings={planWarnings}
          origin={advisorOrigin ?? null}
          onAddStop={onAddAdvisorStop}
          {...(onPlanAdvisorRide ? { onPlanRide: onPlanAdvisorRide } : {})}
        />
      ) : null}

      {comparison ? <RouteComparison {...comparison} showRouteChoices={false} /> : null}
    </PlannerDeck>
  )
}
