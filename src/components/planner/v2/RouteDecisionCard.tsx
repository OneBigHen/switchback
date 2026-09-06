"use client"

import { ArrowRight, WarningCircle } from "@phosphor-icons/react"
import type { FocusEvent, MouseEvent } from "react"
import type { PlannedRoute } from "@/lib/routing/types"
import { CORRIDOR_OPTION_PRESENTATION } from "@/lib/routing/sketch-corridor"
import styles from "./RouteDecisionCard.module.css"

export type RouteDecisionRole =
  | "Fastest Now"
  | "Fast & Fun"
  | "Maximum Twisties"
  | "Best Ride"
  | "Traced"
  | "Better roads nearby"
  | "Leaner"

export interface RouteDecisionPresentation {
  role: RouteDecisionRole
  /** The line under the role chip: the route's name, or what a free-draw option did. */
  subtitle: string
  timeLabel: string
  distanceLabel: string
  /** Difference from the rider's currently selected candidate. */
  deltaLabel: string | null
  character: string
  warning: string | null
}

/**
 * Surfaces we are willing to call unpaved to a rider.
 *
 * This is an allow-list on purpose. Counting "everything that is not asphalt"
 * turns `unknown` into gravel, and a route with no surface data at all — a
 * Valhalla candidate arrives with an empty `surfaceMix` — into a fully unpaved
 * one. Saying "30% unpaved" about a road nobody mapped is exactly the kind of
 * invented fact the product is not allowed to state.
 */
const UNPAVED_SURFACES = new Set([
  "gravel", "fine_gravel", "compacted", "dirt", "earth", "ground", "unpaved",
  "sand", "mud", "grass", "sett", "cobblestone", "pebblestone", "rock"
])

/** Share of the route on surfaces actually mapped as unpaved. */
function unpavedShare(route: PlannedRoute): number {
  return Object.entries(route.surfaceMix).reduce((total, [surface, share]) => (
    UNPAVED_SURFACES.has(surface.toLowerCase()) ? total + share : total
  ), 0)
}

/**
 * Whether this route carries any usable surface evidence. A route with an empty
 * mix, or one that is only `unknown`, tells us nothing — so it cannot take part
 * in a surface comparison.
 */
function hasSurfaceEvidence(route: PlannedRoute): boolean {
  return Object.entries(route.surfaceMix)
    .some(([surface, share]) => share > 0 && surface.toLowerCase() !== "unknown")
}

function signedInteger(value: number, suffix: string, separator = " "): string | null {
  const rounded = Math.round(value)
  if (rounded === 0) return null
  return `${rounded > 0 ? "+" : ""}${rounded}${separator}${suffix}`
}

function signedDecimal(value: number, suffix: string): string | null {
  const rounded = Math.round(value * 10) / 10
  if (Math.abs(rounded) < 0.05) return null
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} ${suffix}`
}

function comparisonLabel(
  route: PlannedRoute,
  selectedRoute: PlannedRoute | null,
  routes: PlannedRoute[]
): string | null {
  if (!selectedRoute) return null

  // Added minutes versus the fastest candidate are always shown (ADR 0022), so
  // this is computed for every card — including the selected one, whose detour
  // cost is precisely the number the rider is deciding about.
  const fastestMinutes = Math.min(...routes.map((candidate) => candidate.durationMinutes))
  const versusFastest = signedInteger(route.durationMinutes - fastestMinutes, "min vs fastest")

  if (route.id === selectedRoute.id) {
    return versusFastest ? `Current route · ${versusFastest}` : "Current route"
  }

  // A surface delta is only meaningful when both sides actually carry surface
  // evidence; otherwise the comparison invents one.
  const surfaceComparable = hasSurfaceEvidence(route) && hasSurfaceEvidence(selectedRoute)

  const parts = [
    signedInteger(route.durationMinutes - selectedRoute.durationMinutes, "min"),
    signedDecimal(route.distanceMiles - selectedRoute.distanceMiles, "mi"),
    surfaceComparable
      ? signedInteger(unpavedShare(route) - unpavedShare(selectedRoute), "% unpaved", "")
      : null,
    signedInteger(route.twistiness - selectedRoute.twistiness, "curve"),
    versusFastest
  ].filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join(" · ") : "Same key metrics"
}

export function routeDecisionRole(route: PlannedRoute, routes: PlannedRoute[]): RouteDecisionRole {
  if (route.corridorOption) {
    return CORRIDOR_OPTION_PRESENTATION[route.corridorOption].label as RouteDecisionRole
  }
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

export function buildRouteDecisionPresentation(
  route: PlannedRoute,
  routes: PlannedRoute[],
  selectedRouteId?: string | null
): RouteDecisionPresentation {
  const selectedRoute = routes.find((candidate) => candidate.id === selectedRouteId) ?? null
  const roughShare = unpavedShare(route)
  const character = roughShare >= 25
    ? `${Math.round(roughShare)}% mixed surface · ${Math.round(route.twistiness)} curve score`
    : route.twistiness >= 80
      ? `Dense curves · ${Math.round(route.twistiness)} curve score`
      : route.twistiness >= 60
        ? `Flowing back roads · ${Math.round(route.twistiness)} curve score`
        : `Faster roads · ${Math.round(route.twistiness)} curve score`

  const corridorCharacter = route.corridorAdherence
    ? `${Math.round(route.corridorAdherence.coveredShare * 100)}% of your line · ${character}`
    : character

  const warning = route.previewOnly
    ? "Preview route — verify before riding."
    : route.navigationMode === "track-only"
      ? "Track guidance only; turn-by-turn is unavailable."
      : route.lockSatisfaction?.some((lock) => lock.satisfied === false)
        ? "A required road could not be included."
        : null

  return {
    role: routeDecisionRole(route, routes),
    subtitle: route.corridorOption
      ? CORRIDOR_OPTION_PRESENTATION[route.corridorOption].description
      : route.name,
    timeLabel: `${Math.round(route.durationMinutes)} min`,
    distanceLabel: `${route.distanceMiles.toFixed(1)} mi`,
    deltaLabel: comparisonLabel(route, selectedRoute, routes),
    character: corridorCharacter,
    warning
  }
}

export interface RouteDecisionCardProps {
  route: PlannedRoute
  routes: PlannedRoute[]
  selected: boolean
  selectedRouteId?: string | null
  onSelect(id: string): void
  onOpenDetails?(id: string): void
  onPreview?(id: string | null): void
}

export function RouteDecisionCard({
  route,
  routes,
  selected,
  selectedRouteId,
  onSelect,
  onOpenDetails,
  onPreview
}: RouteDecisionCardProps) {
  const presentation = buildRouteDecisionPresentation(route, routes, selectedRouteId)

  const preview = () => {
    if (!selected) onPreview?.(route.id)
  }
  const clearPointerPreview = (event: MouseEvent<HTMLElement>) => {
    if (event.currentTarget.contains(document.activeElement)) return
    onPreview?.(null)
  }
  const clearFocusPreview = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    onPreview?.(null)
  }

  return (
    <article
      className={styles.card}
      aria-label={`${presentation.role}: ${presentation.subtitle} route option`}
      data-selected={selected ? "true" : "false"}
      onMouseEnter={preview}
      onMouseLeave={clearPointerPreview}
      onFocusCapture={preview}
      onBlurCapture={clearFocusPreview}
    >
      <button
        type="button"
        className={styles.select}
        aria-label={`Select ${presentation.subtitle}`}
        aria-pressed={selected}
        onClick={() => {
          onPreview?.(null)
          onSelect(route.id)
        }}
      >
        <span className={styles.heading}>
          <span className={styles.role}>{presentation.role}</span>
          <strong>{presentation.subtitle}</strong>
        </span>
        {selected ? <span className={styles.selectedMarker}>Selected</span> : null}
        <span className={styles.metrics} aria-label={`${presentation.timeLabel}, ${presentation.distanceLabel}`}>
          <b>{presentation.timeLabel}</b>
          <span>{presentation.distanceLabel}</span>
          <small>{presentation.deltaLabel ?? "Compare after selecting"}</small>
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
          aria-label={`Details for ${presentation.subtitle}`}
          onClick={() => onOpenDetails(route.id)}
        >
          <span>Details</span>
          <ArrowRight weight="bold" aria-hidden="true" />
        </button>
      ) : null}
    </article>
  )
}
