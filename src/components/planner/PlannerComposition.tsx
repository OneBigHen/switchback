"use client"

import type { ComponentProps } from "react"
import { PlannerDeck } from "./PlannerDeck"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "./PlannerDeckViewModel"
import { RouteComparison } from "./RouteComparison"
import { RouteDecisionRail } from "./v2/RouteDecisionRail"
import { RideAdvisor } from "./v2/RideAdvisor"
import type { Waypoint } from "@/lib/routing/types"

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
  onAddAdvisorStop
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
              onAddStop={onAddAdvisorStop}
            />
          ) : null}
          <RouteComparison {...comparison} showRouteChoices={false} />
        </>
      ) : null}
    </PlannerDeck>
  )
}
