"use client"

import type { ComponentProps } from "react"
import { PlannerDeck } from "./PlannerDeck"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "./PlannerDeckViewModel"
import { RouteComparison } from "./RouteComparison"

type RouteComparisonProps = ComponentProps<typeof RouteComparison>

export interface PlannerCompositionProps {
  viewModel: PlannerDeckViewModel
  commands: PlannerDeckCommands
  comparison: RouteComparisonProps | null
}

/**
 * Planner-only composition boundary. It owns no state or effects; it keeps
 * route comparison composition out of the shell without changing behavior.
 */
export function PlannerComposition({ viewModel, commands, comparison }: PlannerCompositionProps) {
  return (
    <PlannerDeck viewModel={viewModel} commands={commands}>
      {comparison ? <RouteComparison {...comparison} /> : null}
    </PlannerDeck>
  )
}
