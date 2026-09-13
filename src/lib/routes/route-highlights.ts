/**
 * Rider-facing highlight chips for a catalog route.
 *
 * Every chip here must be traceable to something the catalog actually knows.
 * The approved design shows concepts like "creek crossings", "scenic" and
 * "remote"; OpenGravel's import pipeline does not measure any of them, so they
 * are deliberately absent rather than guessed from a route's name or vibe. A
 * sparse row of true chips is the correct output, not a failure to fill space.
 */

import type { SurfaceEvidence } from "./route-evidence"

export type HighlightTone = "surface" | "corners" | "scale" | "bike"

export interface RouteHighlight {
  readonly id: string
  readonly label: string
  readonly tone: HighlightTone
  /** What in the data supports this chip. */
  readonly basis: string
}

export interface RouteHighlightInput {
  readonly distanceMiles: number
  readonly twistiness: number
  readonly turnCount: number
  readonly ascentMeters: number | null
  readonly profile: string | null
  readonly surface: SurfaceEvidence
}

/** Rides this long are a commitment, not an afternoon. */
const BIG_RIDE_MILES = 150
const LONG_RIDE_MILES = 90

export function routeSizeEyebrow(distanceMiles: number): string | null {
  if (!Number.isFinite(distanceMiles) || distanceMiles <= 0) return null
  if (distanceMiles >= BIG_RIDE_MILES) return "BIG RIDE"
  if (distanceMiles >= LONG_RIDE_MILES) return "LONG RIDE"
  return null
}

export function routeHighlights(input: RouteHighlightInput): RouteHighlight[] {
  const highlights: RouteHighlight[] = []

  if (input.surface.level !== "unknown" && input.surface.unpavedShare !== null) {
    const percent = Math.round(input.surface.unpavedShare * 100)
    if (percent >= 50) {
      highlights.push({
        id: "gravel-heavy",
        label: "Gravel-heavy",
        tone: "surface",
        basis: `${percent}% of this route is unpaved (${input.surface.label.toLowerCase()}).`
      })
    } else if (percent >= 15) {
      highlights.push({
        id: "mixed-surface",
        label: "Mixed surface",
        tone: "surface",
        basis: `${percent}% of this route is unpaved (${input.surface.label.toLowerCase()}).`
      })
    }
  }

  if (input.profile === "adventure") {
    highlights.push({
      id: "adv-friendly",
      label: "ADV-friendly",
      tone: "bike",
      basis: "This route was filed under the adventure profile."
    })
  }

  if (input.turnCount > 0 && input.twistiness >= 65) {
    highlights.push({
      id: "technical",
      label: "Technical corners",
      tone: "corners",
      basis: "Measured curvature puts this route in the hairpin band."
    })
  } else if (input.turnCount > 0 && input.twistiness >= 45) {
    highlights.push({
      id: "twisty",
      label: "Twisty",
      tone: "corners",
      basis: "Measured curvature puts this route in the twisty band."
    })
  }

  if (
    typeof input.ascentMeters === "number"
    && input.ascentMeters > 0
    && input.distanceMiles > 0
    && (input.ascentMeters * 3.28084) / input.distanceMiles >= 130
  ) {
    highlights.push({
      id: "sustained-climbs",
      label: "Sustained climbs",
      tone: "scale",
      basis: "Recorded ascent works out to serious climbing per mile."
    })
  }

  if (input.distanceMiles >= BIG_RIDE_MILES) {
    highlights.push({
      id: "big-ride",
      label: "Full-day commitment",
      tone: "scale",
      basis: `${Math.round(input.distanceMiles)} miles end to end.`
    })
  }

  return highlights
}
