"use client"

import { ArrowRight, Star } from "@phosphor-icons/react"
import Link from "next/link"
import { useMemo, type ReactNode } from "react"
import { formatAway } from "@/lib/client/near-me"
import { formatDuration, formatMiles, type AtlasBrowseRoute } from "@/app/gpx-library/atlas-browse"
import { RouteMapThumbnail } from "./RouteMapThumbnail"
import { browseRouteGeography } from "./route-preview-source"
import { hasGravelEvidence, routeMinutes } from "./route-discovery-state"
import styles from "./RouteDiscoveryCard.module.css"

const BAND_LABEL: Record<AtlasBrowseRoute["band"], string> = {
  calm: "Calm",
  mellow: "Mellow",
  twisty: "Twisty",
  hairpin: "Hairpin"
}

export function routeAreaLabel(route: AtlasBrowseRoute): string | null {
  const parts = [route.region, ...route.ridingAreas].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(" · ") : null
}

/**
 * Surface as the catalog can actually support it.
 *
 * The shared listing carries no measured surface mix, so a percentage here
 * would be invented. An adventure/gravel routing profile is real evidence of
 * intent; nothing at all is stated as unknown.
 */
export function routeSurfaceLabel(
  route: AtlasBrowseRoute
): { text: string; evidence: "verified" | "estimated" | "unknown" } {
  if (route.unpavedShare !== null) {
    return { text: `${Math.round(route.unpavedShare * 100)}% unpaved`, evidence: "verified" }
  }
  if (hasGravelEvidence(route)) return { text: "Gravel-capable", evidence: "estimated" }
  return { text: "Surface unknown", evidence: "unknown" }
}

export interface RouteDiscoveryCardProps {
  route: AtlasBrowseRoute
  awayMiles: number | null
  variant: "list" | "rail"
  selected?: boolean
  saved?: boolean
  /** Selects on the map instead of navigating; omit for a plain link card. */
  onSelect?(routeId: string): void
}

/**
 * One route, presented for a rider deciding whether to ride it.
 *
 * The information order is the approved one: geography, name, distance and
 * time, character and surface, area, then the ride's own short story. Mapped
 * turn counts are deliberately absent — they are an analyzer diagnostic, not a
 * reason anybody picks a road — and live on the route detail page instead.
 */
export function RouteDiscoveryCard({
  route,
  awayMiles,
  variant,
  selected = false,
  saved = false,
  onSelect
}: RouteDiscoveryCardProps) {
  const geography = useMemo(() => browseRouteGeography(route), [route])
  const area = routeAreaLabel(route)
  const surface = routeSurfaceLabel(route)
  const { minutes, estimated } = routeMinutes(route)
  const duration = formatDuration(minutes)
  const detailHref = `/gpx-library/${route.id}`

  const content: ReactNode = (
    <>
      <span className={styles.preview}>
        <RouteMapThumbnail
          routeId={route.id}
          geometry={geography.geometry}
          bbox={route.bbox ?? null}
          start={geography.start}
          end={geography.end}
          fingerprint={geography.fingerprint}
          size={variant === "rail" ? "medium" : "small"}
          label={`Map of ${route.title}`}
        />
        {awayMiles !== null ? <span className={styles.away}>{formatAway(awayMiles)}</span> : null}
      </span>

      <span className={styles.info}>
        <span className={styles.titleRow}>
          <strong className={styles.title}>{route.title}</strong>
          {saved ? (
            <span className={styles.saved}>
              <Star weight="fill" aria-hidden="true" />
              <span className={styles.visuallyHidden}>Saved to your rides</span>
            </span>
          ) : null}
        </span>

        <span className={styles.stats}>
          <span className={styles.statLead}>{formatMiles(route.distanceMiles)} mi</span>
          {duration ? (
            <span className={styles.stat} data-evidence={estimated ? "estimated" : "verified"}>
              {duration}
              {estimated ? <em className={styles.estimate} title="Estimated from distance">est</em> : null}
            </span>
          ) : (
            <span className={styles.stat} data-evidence="unknown">Time unknown</span>
          )}
        </span>

        <span className={styles.character}>
          <span className={`${styles.band} band-${route.band}`}>{BAND_LABEL[route.band]}</span>
          <span className={styles.surface} data-evidence={surface.evidence}>{surface.text}</span>
        </span>

        {area ? <span className={styles.area}>{area}</span> : null}
        <span className={styles.story}>{route.tone}</span>
      </span>
    </>
  )

  const classes = [
    styles.card,
    variant === "rail" ? styles.rail : styles.list,
    selected ? styles.isSelected : null
  ].filter(Boolean).join(" ")

  return (
    <article className={classes} data-route-card={route.id} data-selected={selected ? "true" : "false"}>
      {onSelect ? (
        <button
          type="button"
          className={styles.selectSurface}
          aria-pressed={selected}
          aria-label={`${route.title} — show on map`}
          onClick={() => onSelect(route.id)}
        >
          {content}
        </button>
      ) : (
        <Link className={styles.linkSurface} href={detailHref} aria-label={`${route.title} — open route`}>
          {content}
        </Link>
      )}

      {/* The primary action is a sibling of the selection surface, never nested
          inside it: a link inside a button is invalid and unreachable by
          keyboard. */}
      {variant === "rail" ? (
        <Link className={styles.viewRoute} href={detailHref}>
          <span>View route</span>
          <ArrowRight weight="bold" aria-hidden="true" />
        </Link>
      ) : null}
    </article>
  )
}
