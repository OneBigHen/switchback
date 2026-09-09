import type { ComponentProps } from "react"
import type { ProposedRide, ProposedStop } from "@/lib/advice/contracts"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "./PlannerDeckViewModel"

export type PlannerRouteComparisonProps = ComponentProps<typeof import("./RouteComparison").RouteComparison>

export interface PlannerPresentationModel {
  readonly deck: PlannerDeckViewModel
  readonly comparison: PlannerRouteComparisonProps | null
  readonly planWarnings: string[]
  readonly advisorOrigin: { lat: number; lon: number; label?: string } | null
}

export interface PlannerPresentationCommands {
  readonly deck: PlannerDeckCommands
  readonly addAdvisorStop?: (stop: ProposedStop) => void
  readonly planAdvisorRide?: (ride: ProposedRide) => void
}

export interface PlannerPresentationBoundary {
  readonly model: PlannerPresentationModel
  readonly commands: PlannerPresentationCommands
}

export interface PlannerPresentationInput {
  viewModel: PlannerDeckViewModel
  commands: PlannerDeckCommands
  comparison: PlannerRouteComparisonProps | null
  planWarnings?: string[]
  onAddAdvisorStop?(stop: ProposedStop): void
  onPlanAdvisorRide?(ride: ProposedRide): void
  advisorOrigin?: { lat: number; lon: number; label?: string } | null
}

const NO_WARNINGS: string[] = []

/**
 * Compatibility adapter for the current PlannerShell call site. New frontend
 * work should consume PlannerPresentationBoundary instead of adding more flat
 * props to PlannerComposition.
 */
export function createPlannerPresentationBoundary({
  viewModel,
  commands,
  comparison,
  planWarnings = NO_WARNINGS,
  onAddAdvisorStop,
  onPlanAdvisorRide,
  advisorOrigin = null
}: PlannerPresentationInput): PlannerPresentationBoundary {
  return {
    model: {
      deck: viewModel,
      comparison,
      planWarnings,
      advisorOrigin
    },
    commands: {
      deck: commands,
      ...(onAddAdvisorStop ? { addAdvisorStop: onAddAdvisorStop } : {}),
      ...(onPlanAdvisorRide ? { planAdvisorRide: onPlanAdvisorRide } : {})
    }
  }
}
