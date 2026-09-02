/**
 * Client-safe helpers for the route atlas browser: the row shape the server
 * hands the client, the geo maths behind "rides near me", a coarse offline
 * area classifier, and the pure filter/sort the UI drives. No `node:` imports
 * here — this module is bundled for the browser.
 */

import type { CurvatureBand } from "@/lib/gpx/atlas"
import { centerOfBbox, haversineMiles, type NearMeAnchor } from "@/lib/client/geo"

export { formatAway } from "@/lib/client/geo"

export type AtlasSortId = "nearest" | "longest" | "shortest" | "twistiest"
export type AtlasLengthBucket = "short" | "day" | "big"
export type AtlasRadiusId = "25" | "100" | "250" | "any"

/** One route as it travels from the atlas page's server component to the browser UI. */
export interface AtlasBrowseRoute {
  readonly id: string
  readonly name: string
  /** Editorial headline from `buildRouteStory`, already resolved server-side. */
  readonly title: string
  /** Stable pacing tag, e.g. "Day loop". */
  readonly tone: string
  readonly band: CurvatureBand
  readonly distanceMiles: number
  /** Moving time in minutes; `0` when the import carried none. */
  readonly durationMinutes: number
  readonly turnCount: number
  readonly twistiness: number
  /** Share (0..1) of route distance on unpaved surface, when the mix is known. */
  readonly unpavedShare: number | null
  /** `[west, south, east, north]` in degrees, or null when geometry was not retained. */
  readonly bbox: readonly [number, number, number, number] | null
  /** Coarse offline area label from the route centroid, or null when unplaceable. */
  readonly region: string | null
  /** Mercator width/height ratio of the route, for framing the minimap. */
  readonly aspect: number
  /** Poster path pieces in a 0 0 100 125 viewBox. */
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
  readonly query: string
}

export const DEFAULT_FILTERS: AtlasFilterState = {
  sort: "longest",
  radius: "any",
  lengths: [],
  bands: [],
  region: null,
  query: ""
}

/**
 * Roughly how far the rider is from a route, measured to the centre of its
 * bounding box. The centroid — not the nearest edge — is what "is this ride
 * near me" means when browsing: a 300-mile ride that happens to clip the
 * rider's town is not a local ride, and should sort like the far-off ride it is.
 */
export function distanceFromAnchorMiles(
  anchor: AtlasAnchor,
  bbox: readonly [number, number, number, number]
): number {
  return haversineMiles([anchor.lon, anchor.lat], centerOfBbox(bbox))
}

/**
 * Coarse, offline area label from a route centroid. This is a filing aid for
 * the browser's region chips, not a geocoder: a route that straddles a border
 * is filed by its centre, and anything outside the boxes below reads as
 * "Farther afield". No network, no new data source (AGENTS.md integration gate).
 */
const REGION_BOXES: ReadonlyArray<{ label: string; west: number; south: number; east: number; north: number }> = [
  { label: "Western Pennsylvania", west: -80.6, south: 39.7, east: -78.3, north: 42.3 },
  { label: "Central Pennsylvania", west: -78.3, south: 39.7, east: -76.7, north: 42.3 },
  { label: "Eastern Pennsylvania", west: -76.7, south: 39.7, east: -74.7, north: 42.3 },
  { label: "New Jersey", west: -75.6, south: 38.9, east: -73.9, north: 41.4 },
  { label: "New York", west: -79.8, south: 40.5, east: -71.8, north: 45.1 },
  { label: "West Virginia & Maryland", west: -82.7, south: 37.2, east: -75.0, north: 39.7 },
  { label: "Virginia", west: -83.7, south: 36.5, east: -75.2, north: 39.5 },
  { label: "Ohio", west: -84.9, south: 38.4, east: -80.5, north: 42.3 },
  { label: "New England", west: -73.8, south: 41.0, east: -66.8, north: 47.5 },
  { label: "Europe", west: -11.0, south: 35.0, east: 32.0, north: 60.0 }
]

export function classifyRegion(bbox: readonly [number, number, number, number] | null): string | null {
  if (!bbox) return null
  const [lon, lat] = centerOfBbox(bbox)
  for (const box of REGION_BOXES) {
    if (lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north) return box.label
  }
  return "Farther afield"
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
  /** Miles from the rider, when a location is known and the route is placeable. */
  readonly awayMiles: number | null
}

export interface AtlasBrowseResult {
  readonly ranked: readonly RankedAtlasRoute[]
  /** Rows dropped only because they fell outside the active distance radius. */
  readonly outsideRadius: number
}

/**
 * The single pure transform the browser UI runs: apply the text, length,
 * corner, region and radius filters, then order what survives. Kept here so it
 * can be reasoned about and tested without a DOM.
 */
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
    if (query && !`${route.title} ${route.name}`.toLowerCase().includes(query)) continue
    if (filters.lengths.length > 0 && !filters.lengths.includes(lengthBucket(route.distanceMiles))) continue
    if (filters.bands.length > 0 && !filters.bands.includes(route.band)) continue
    if (filters.region && route.region !== filters.region) continue

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
