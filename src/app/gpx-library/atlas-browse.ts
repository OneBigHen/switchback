/**
 * Client-safe helpers for the route atlas browser: the row shape the server
 * hands the client, the geo maths behind "rides near me", and the pure
 * filter/sort the UI drives. No `node:` imports here — this module is bundled
 * for the browser.
 */

import type { CurvatureBand } from "@/lib/gpx/atlas"
import { centerOfBbox, haversineMiles, type NearMeAnchor } from "@/lib/client/geo"
import { classifyRouteGeography } from "@/lib/gpx/route-regions"

export { formatAway } from "@/lib/client/geo"

export type AtlasSortId = "nearest" | "longest" | "shortest" | "twistiest"
export type AtlasLengthBucket = "short" | "day" | "big"
export type AtlasRadiusId = "25" | "100" | "250" | "any"

export interface AtlasBrowseRoute {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly tone: string
  readonly band: CurvatureBand
  readonly distanceMiles: number
  readonly durationMinutes: number
  readonly turnCount: number
  readonly twistiness: number
  readonly unpavedShare: number | null
  readonly bbox: readonly [number, number, number, number] | null
  /** Broad browse bucket such as North-Central PA. */
  readonly region: string | null
  /** Recognizable rider areas; one route may span several. */
  readonly ridingAreas: readonly string[]
  readonly aspect: number
  readonly paths: readonly string[]
  readonly start: readonly [number, number] | null
  readonly end: readonly [number, number] | null
}

export type AtlasAnchor = NearMeAnchor

export interface AtlasFilterState {
  readonly sort: AtlasSortId
  readonly radius: AtlasRadiusId
  readonly lengths: readonly AtlasLengthBucket[]
  readonly bands: readonly CurvatureBand[]
  readonly region: string | null
  readonly area: string | null
  readonly query: string
}

export const DEFAULT_FILTERS: AtlasFilterState = {
  sort: "longest",
  radius: "any",
  lengths: [],
  bands: [],
  region: null,
  area: null,
  query: ""
}

export function distanceFromAnchorMiles(
  anchor: AtlasAnchor,
  bbox: readonly [number, number, number, number]
): number {
  return haversineMiles([anchor.lon, anchor.lat], centerOfBbox(bbox))
}

/** Compatibility helper for callers that only need the broad browse bucket. */
export function classifyRegion(bbox: readonly [number, number, number, number] | null): string | null {
  return classifyRouteGeography(bbox).macroRegion
}

export const LENGTH_BUCKETS: ReadonlyArray<{ id: AtlasLengthBucket; label: string; test: (mi: number) => boolean }> = [
  { id: "short", label: "Under 50 mi", test: (mi) => mi < 50 },
  { id: "day", label: "50–150 mi", test: (mi) => mi >= 50 && mi < 150 },
  { id: "big", label: "150 mi and up", test: (mi) => mi >= 150 }
]

export function lengthBucket(distanceMiles: number): AtlasLengthBucket {
  return LENGTH_BUCKETS.find((bucket) => bucket.test(distanceMiles))?.id ?? "day"
}

export const RADIUS_MILES: Record<Exclude<AtlasRadiusId, "any">, number> = { "25": 25, "100": 100, "250": 250 }
export const CURVATURE_BAND_ORDER: readonly CurvatureBand[] = ["calm", "mellow", "twisty", "hairpin"]

const WHOLE_NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

export function formatMiles(value: number): string {
  return WHOLE_NUMBER.format(Math.max(0, Math.round(value)))
}

export function formatDuration(minutes: number): string | null {
  const total = Math.round(minutes)
  if (!Number.isFinite(total) || total <= 0) return null
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (hours === 0) return `${mins} min`
  if (mins === 0) return `${hours} hr`
  return `${hours} hr ${mins} min`
}

export interface RankedAtlasRoute {
  readonly route: AtlasBrowseRoute
  readonly awayMiles: number | null
}

export interface AtlasBrowseResult {
  readonly ranked: readonly RankedAtlasRoute[]
  readonly outsideRadius: number
}

export function browseAtlas(
  routes: readonly AtlasBrowseRoute[],
  filters: AtlasFilterState,
  anchor: AtlasAnchor | null
): AtlasBrowseResult {
  const query = filters.query.trim().toLowerCase()
  const radiusMiles = filters.radius === "any" ? null : RADIUS_MILES[filters.radius]
  let outsideRadius = 0

  const ranked: RankedAtlasRoute[] = []
  for (const route of routes) {
    const searchable = `${route.title} ${route.name} ${route.region ?? ""} ${route.ridingAreas.join(" ")}`.toLowerCase()
    if (query && !searchable.includes(query)) continue
    if (filters.lengths.length > 0 && !filters.lengths.includes(lengthBucket(route.distanceMiles))) continue
    if (filters.bands.length > 0 && !filters.bands.includes(route.band)) continue
    if (filters.region && route.region !== filters.region) continue
    if (filters.area && !route.ridingAreas.includes(filters.area)) continue

    const awayMiles = anchor && route.bbox ? distanceFromAnchorMiles(anchor, route.bbox) : null
    if (radiusMiles !== null && anchor) {
      if (awayMiles === null || awayMiles > radiusMiles) {
        if (awayMiles !== null) outsideRadius += 1
        continue
      }
    }
    ranked.push({ route, awayMiles })
  }

  ranked.sort((a, b) => compareRanked(a, b, filters.sort))
  return { ranked, outsideRadius }
}

function compareRanked(a: RankedAtlasRoute, b: RankedAtlasRoute, sort: AtlasSortId): number {
  switch (sort) {
    case "nearest": {
      const av = a.awayMiles ?? Number.POSITIVE_INFINITY
      const bv = b.awayMiles ?? Number.POSITIVE_INFINITY
      return av - bv || b.route.distanceMiles - a.route.distanceMiles
    }
    case "shortest":
      return a.route.distanceMiles - b.route.distanceMiles
    case "twistiest":
      return b.route.twistiness - a.route.twistiness || b.route.distanceMiles - a.route.distanceMiles
    case "longest":
    default:
      return b.route.distanceMiles - a.route.distanceMiles
  }
}
