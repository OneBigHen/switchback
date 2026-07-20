import type { PlannedRoute } from "@/lib/routing/types"

/**
 * Route-level data quality confidence. Switchback turns a weakness in
 * source data into a useful feature: instead of asserting "West
 * Virginia data is poor", we compute confidence for each actual route
 * so the rider sees the segments they should verify.
 */
export interface RouteDataQuality {
  accessCoveragePercent: number
  surfaceCoveragePercent: number
  conditionCoveragePercent: number
  /** True when at least one segment carries seasonal=yes without a date range. */
  seasonalUncertainty: boolean
  /** Length of route (miles) on edges whose surface tag is unknown. */
  unknownSurfaceMiles: number
  /** Total route length in miles. */
  totalMiles: number
  /** Smallest coverage percentage, surfaced as the headline confidence. */
  headlinePercent: number
  /** Last map update ISO timestamp this route was prepared against. */
  sourceMapUpdated: string | null
  /** Caveats surfaced to the rider on the route card. */
  caveats: string[]
}

const UNPAVED_SURFACES = new Set([
  "compacted", "dirt", "earth", "fine_gravel", "grass", "gravel", "ground", "mud", "sand", "unpaved"
])

function coveragePercent(known: number, total: number): number {
  if (total <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((known / total) * 100)))
}

/**
 * Compute route-level data quality. Surfaces and road classes are
 * surfaced through GraphHopper's path details; this helper converts a
 * {@link PlannedRoute}'s road/surface mixes, twistiness, total length,
 * and a small optional segment list into the coverage bars shown to the
 * rider. Considered approximate; the planner never claims certainty
 * where OSM data is silent.
 *
 * The optional `segments` argument lets the planner pass per-edge
 * knowledge when it is available (for example, from corridor graph
 * tags), and falls back to the route's mix otherwise.
 */
export function computeRouteDataQuality(input: {
  route: PlannedRoute
  segments?: ReadonlyArray<{
    miles: number
    hasAccessTag?: boolean
    hasSurfaceTag?: boolean
    hasSmoothnessOrTracktype?: boolean
    seasonalUndated?: boolean
  }>
  sourceMapUpdated?: string | null
}): RouteDataQuality {
  const route = input.route
  const totalMiles = Math.max(0, Number.isFinite(route.distanceMiles) ? route.distanceMiles : 0)
  const caveats: string[] = []

  let knownAccessMiles = 0
  let knownSurfaceMiles = 0
  let knownConditionMiles = 0
  let unknownSurfaceMiles = 0
  let seasonalUncertainty = false

  if (input.segments && input.segments.length > 0) {
    for (const segment of input.segments) {
      const miles = Math.max(0, segment.miles)
      if (segment.hasAccessTag) knownAccessMiles += miles
      if (segment.hasSurfaceTag) {
        knownSurfaceMiles += miles
      } else {
        unknownSurfaceMiles += miles
      }
      if (segment.hasSmoothnessOrTracktype) knownConditionMiles += miles
      if (segment.seasonalUndated) seasonalUncertainty = true
    }
  } else {
    // Best-effort fallback when no per-edge segments are available:
    // treat any non-empty surfaceMix as a partial surface coverage
    // signal. Unknown surfaces appear as the literal "unknown" bucket.
    const surfaceEntries = Object.entries(route.surfaceMix)
    const surfaceTotal = surfaceEntries.reduce((sum, [, share]) => sum + share, 0)
    if (surfaceTotal > 0) {
      for (const [surface, share] of surfaceEntries) {
        const miles = (share / surfaceTotal) * totalMiles
        if (surface.toLowerCase() === "unknown") {
          unknownSurfaceMiles += miles
        } else {
          knownSurfaceMiles += miles
        }
      }
      knownConditionMiles = Object.entries(route.roadMix)
        .filter(([cls]) => UNPAVED_SURFACES.has(cls.toLowerCase()))
        .reduce((sum, [, share]) => sum + (share / 100) * totalMiles, 0)
    } else {
      unknownSurfaceMiles = totalMiles
    }
    knownAccessMiles = totalMiles
  }

  const accessCoveragePercent = coveragePercent(knownAccessMiles, totalMiles)
  const surfaceCoveragePercent = coveragePercent(knownSurfaceMiles, totalMiles)
  const conditionCoveragePercent = coveragePercent(knownConditionMiles, totalMiles)
  const headlinePercent = Math.min(accessCoveragePercent, surfaceCoveragePercent, conditionCoveragePercent)

  if (unknownSurfaceMiles > 0) {
    caveats.push(`Surface type is unknown for ${unknownSurfaceMiles.toFixed(1)} miles of this route.`)
  }
  if (seasonalUncertainty) {
    caveats.push("At least one segment is tagged seasonal without a date range. Verify access before riding.")
  }
  if (accessCoveragePercent < 100) {
    caveats.push(`Access data is missing on ${(totalMiles - knownAccessMiles).toFixed(1)} miles of this route.`)
  }
  if (conditionCoveragePercent < 60) {
    caveats.push("Surface condition data is sparse along this route. Inspect before high-speed riding.")
  }

  return {
    accessCoveragePercent,
    surfaceCoveragePercent,
    conditionCoveragePercent,
    seasonalUncertainty,
    unknownSurfaceMiles: Number(unknownSurfaceMiles.toFixed(2)),
    totalMiles,
    headlinePercent,
    sourceMapUpdated: input.sourceMapUpdated ?? null,
    caveats
  }
}
