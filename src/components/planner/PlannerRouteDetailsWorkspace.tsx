"use client"

import { ArrowLeft } from "@phosphor-icons/react"
import { RouteComparison } from "./RouteComparison"
import type { PlannerRouteComparisonProps } from "./PlannerPresentationBoundary"

type PlannedRoute = PlannerRouteComparisonProps["routes"][number]

interface PlannerRouteDetailsWorkspaceProps {
  comparison: PlannerRouteComparisonProps
  route: PlannedRoute
  onBack(): void
}

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
      <RouteComparison
        {...comparison}
        selectedId={route.id}
        showRouteChoices={false}
      />
    </section>
  )
}
