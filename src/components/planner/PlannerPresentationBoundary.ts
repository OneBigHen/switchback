import type { ComponentProps } from "react"
import type { ProposedRide, ProposedStop } from "@/lib/advice/contracts"
import type { RecoveryStatus } from "@/stores/planner-store"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "./PlannerDeckViewModel"
import type { RouteComparison } from "./RouteComparison"

export type PlannerRouteComparisonProps = ComponentProps<typeof RouteComparison>

/**
 * Everything the planner surface renders, and nothing about how it was
 * obtained. No routing, storage, provider or canonical ride authority crosses
 * this line — a value that is not here is not on screen.
 */
export interface PlannerPresentationModel {
  readonly deck: PlannerDeckViewModel
  readonly comparison: PlannerRouteComparisonProps | null
  /** Warnings from the current plan, so the advisor cannot contradict them. */
  readonly planWarnings: string[]
  /** Explicit planner start, so the advisor can search places before a route exists. */
  readonly advisorOrigin: { lat: number; lon: number; label?: string } | null
  /** Draft recovery is still settling. Reported to the rider, never enforced. */
  readonly bootstrapPending: boolean
}

/** Everything the planner surface can ask for. Named intents, not callbacks. */
export interface PlannerPresentationCommands {
  readonly deck: PlannerDeckCommands
  /** Accept an advisor-proposed stop without losing its along-route evidence. */
  readonly addAdvisorStop?: (stop: ProposedStop) => void
  /** Fulfil an explicit better-route-plus-stop command through the planner. */
  readonly routeWithAdvisorStop?: (stop: ProposedStop) => void | Promise<void>
  /** Accept a whole advisor-proposed ride into the planner's own controls. */
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
  /** Canonical draft-recovery lifecycle, not a pre-derived flag. */
  recoveryStatus: RecoveryStatus
  planWarnings?: string[]
  onAddAdvisorStop?(stop: ProposedStop): void
  onRouteWithAdvisorStop?(stop: ProposedStop): void | Promise<void>
  onPlanAdvisorRide?(ride: ProposedRide): void
  advisorOrigin?: { lat: number; lon: number; label?: string } | null
}

const NO_WARNINGS: string[] = []

/**
 * The one place canonical planner state becomes a presentation model.
 *
 * The container reads the store; the surface reads this. Keeping the
 * derivation here rather than inside a component means it can be asserted
 * directly, and that no presentation component needs a store subscription to
 * know what to draw.
 */
export function createPlannerPresentationBoundary({
  viewModel,
  commands,
  comparison,
  recoveryStatus,
  planWarnings = NO_WARNINGS,
  onAddAdvisorStop,
  onRouteWithAdvisorStop,
  onPlanAdvisorRide,
  advisorOrigin = null
}: PlannerPresentationInput): PlannerPresentationBoundary {
  return {
    model: {
      deck: viewModel,
      comparison,
      planWarnings,
      advisorOrigin,
      bootstrapPending: recoveryStatus === "loading"
    },
    commands: {
      deck: commands,
      // Absent rather than a no-op: the surface decides what to offer from
      // whether the command exists at all.
      ...(onAddAdvisorStop ? { addAdvisorStop: onAddAdvisorStop } : {}),
      ...(onRouteWithAdvisorStop ? { routeWithAdvisorStop: onRouteWithAdvisorStop } : {}),
      ...(onPlanAdvisorRide ? { planAdvisorRide: onPlanAdvisorRide } : {})
    }
  }
}
