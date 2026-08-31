"use client"

import { ArrowRight, WarningCircle } from "@phosphor-icons/react"
import type { PlannedRoute } from "@/lib/routing/types"
import styles from "./RouteDecisionCard.module.css"

export type RouteDecisionRole = "Fastest Now" | "Fast & Fun" | "Maximum Twisties" | "Best Ride"

export interface RouteDecisionPresentation {
  role: RouteDecisionRole
  timeLabel: string
  distanceLabel: string
  deltaLabel: string | null
  character: string
  warning: string | null
}

function nonAsphaltShare(route: PlannedRoute): number {
  return Object.entries(route.surfaceMix).reduce((total, [surface, share]) => (
    surface.toLowerCase() === "asphalt" || surface.toLowerCase() === "paved" ? total : total + share
  ), 0)
}

export function routeDecisionRole(route: PlannedRoute, routes: PlannedRoute[]): RouteDecisionRole {
  const fastestMinutes = Math.min(...routes.map((candidate) => candidate.durationMinutes))
  if (route.durationMinutes === fastestMinutes) return "Fastest Now"

  const maxTwistiness = Math.max(...routes.map((candidate) => candidate.twistiness))
  if (route.profile === "twisty" && route.twistiness === maxTwistiness && route.twistiness >= 70) {
    return "Maximum Twisties"
  }
  if (route.profile === "scenic" || route.profile === "adventure" || route.profile === "gravel") return "Best Ride"
  if (route.twistiness === maxTwistiness && route.twistiness >= 70) return "Maximum Twisties"
  return "Fast & Fun"
}

export function buildRouteDecisionPresentation(route: PlannedRoute, routes: PlannedRoute[]): RouteDecisionPresentation {
  const fastestMinutes = Math.min(...routes.map((candidate) => candidate.durationMinutes))
  const delta = Math.max(0, Math.round(route.durationMinutes - fastestMinutes))
  const roughShare = nonAsphaltShare(route)
  const character = roughShare >= 25
    ? `${Math.round(roughShare)}% mixed surface · ${Math.round(route.twistiness)} curve score`
    : route.twistiness >= 80
      ? `Dense curves · ${Math.round(route.twistiness)} curve score`
      : route.twistiness >= 60
        ? `Flowing back roads · ${Math.round(route.twistiness)} curve score`
        : `Faster roads · ${Math.round(route.twistiness)} curve score`

  const warning = route.previewOnly
    ? "Preview route — verify before riding."
    : route.navigationMode === "track-only"
      ? "Track guidance only; turn-by-turn is unavailable."
      : route.lockSatisfaction?.some((lock) => lock.satisfied === false)
        ? "A required road could not be included."
        : null

  return {
    role: routeDecisionRole(route, routes),
    timeLabel: `${Math.round(route.durationMinutes)} min`,
    distanceLabel: `${route.distanceMiles.toFixed(1)} mi`,
    deltaLabel: delta > 0 ? `+${delta} min` : null,
    character,
    warning
  }
}

export interface RouteDecisionCardProps {
  route: PlannedRoute
  routes: PlannedRoute[]
  selected: boolean
  onSelect(id: string): void
  onOpenDetails?(id: string): void
}

export function RouteDecisionCard({ route, routes, selected, onSelect, onOpenDetails }: RouteDecisionCardProps) {
  const presentation = buildRouteDecisionPresentation(route, routes)

  return (
    <article
      className={styles.card}
      aria-label={`${presentation.role} route option`}
      data-selected={selected ? "true" : "false"}
    >
      <button
        type="button"
        className={styles.select}
        aria-label={`Select ${presentation.role}`}
        aria-pressed={selected}
        onClick={() => onSelect(route.id)}
      >
        <span className={styles.heading}>
          <span className={styles.role}>{presentation.role}</span>
          <strong>{route.name}</strong>
        </span>
        <span className={styles.metrics} aria-label={`${presentation.timeLabel}, ${presentation.distanceLabel}`}>
          <b>{presentation.timeLabel}</b>
          <span>{presentation.distanceLabel}</span>
          {presentation.deltaLabel ? <small>{presentation.deltaLabel}</small> : <small>Baseline</small>}
        </span>
        <span className={styles.character}>{presentation.character}</span>
        {presentation.warning ? (
          <span className={styles.warning} data-testid="route-decision-warning">
            <WarningCircle weight="fill" aria-hidden="true" />
            <span>{presentation.warning}</span>
          </span>
        ) : null}
      </button>

      {onOpenDetails ? (
        <button
          type="button"
          className={styles.details}
          aria-label={`Details for ${presentation.role}`}
          onClick={() => onOpenDetails(route.id)}
        >
          <span>Details</span>
          <ArrowRight weight="bold" aria-hidden="true" />
        </button>
      ) : null}
    </article>
  )
}
