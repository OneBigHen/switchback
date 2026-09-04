"use client"

import type { ComponentProps } from "react"
import { PlannerDeck } from "./PlannerDeck"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "./PlannerDeckViewModel"
import { RouteComparison } from "./RouteComparison"
import { RouteDecisionRail } from "./v2/RouteDecisionRail"
import { RideAdvisor } from "./v2/RideAdvisor"
import type { Waypoint } from "@/lib/routing/types"
import type { ProposedRide } from "@/lib/advice/contracts"

type RouteComparisonProps = ComponentProps<typeof RouteComparison>

/** Module-scope so the default keeps a stable identity across renders. */
const NO_WARNINGS: string[] = []

export interface PlannerCompositionProps {
  viewModel: PlannerDeckViewModel
  commands: PlannerDeckCommands
  comparison: RouteComparisonProps | null
  /** Warnings from the current plan, so the advisor cannot contradict them. */
  planWarnings?: string[]
  /** Accept an advisor-proposed stop as an ordinary rider waypoint. */
  onAddAdvisorStop?(stop: Waypoint): void
  /** Accept a whole advisor-proposed ride into the planner's own controls. */
  onPlanAdvisorRide?(ride: ProposedRide): void
  /** Map centre, so the advisor can search places before a route exists. */
  advisorOrigin?: { lat: number; lon: number; label?: string } | null
}

/**
 * Planner-only composition boundary. It owns no state or effects; it keeps
 * route comparison composition out of the shell without changing behavior.
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
        <>
          <RouteDecisionRail
            routes={comparison.routes}
            selectedId={comparison.selectedId}
            onSelect={comparison.onSelect}
          />
          {onAddAdvisorStop ? (
            <RideAdvisor
              routes={comparison.routes}
              selectedRouteId={comparison.selectedId}
              warnings={planWarnings}
              origin={advisorOrigin ?? null}
              onAddStop={onAddAdvisorStop}
              {...(onPlanAdvisorRide ? { onPlanRide: onPlanAdvisorRide } : {})}
            />
          ) : null}
          <RouteComparison {...comparison} showRouteChoices={false} />
        </>
      ) : null}
    </PlannerDeck>
  )
}
