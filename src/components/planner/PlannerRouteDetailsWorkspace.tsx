"use client"

import { ArrowLeft } from "@phosphor-icons/react"
import { RouteComparison } from "./RouteComparison"
import type { PlannerRouteComparisonProps } from "./PlannerPresentationBoundary"

type PlannedRouteProp = PlannerRouteComparisonProps["routes"][number]

interface PlannerRouteDetailsWorkspaceProps {
  comparison: PlannerRouteComparisonProps
  /** Already resolved against the current candidate set and selection. */
  route: PlannedRouteProp
  onBack(): void
}

/**
 * The dense preparation surface for one route the rider asked to inspect. It
 * never chooses a route: it is entered from route choice and names the route it
 * is showing, so the actions inside it can only ever mean that route.
 */
export function PlannerRouteDetailsWorkspace({
  comparison,
  route,
  onBack
}: PlannerRouteDetailsWorkspaceProps) {
  return (
    <section className="planner-route-details" aria-label="Route details workspace">
      <header className="planner-route-details__header">
        <button type="button" aria-label="Back to route choices" onClick={onBack}>
          <ArrowLeft weight="bold" aria-hidden="true" />
          <span>Route options</span>
        </button>
        <span className="planner-route-details__identity">
          <small>Route details</small>
          <strong>{route.name}</strong>
        </span>
      </header>
      <RouteComparison {...comparison} selectedId={route.id} />
    </section>
  )
}
