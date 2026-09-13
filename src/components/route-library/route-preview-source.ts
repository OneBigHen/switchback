import type { AtlasBrowseRoute } from "@/app/gpx-library/atlas-browse"
import type { AtlasRouteArt } from "@/lib/gpx/atlas"
import {
  atlasGeoEndpoints,
  atlasGeometryFingerprint,
  atlasGeoPolyline,
  simplifyForOverlay
} from "@/lib/routes/route-preview"
import type { Coordinate } from "@/lib/routing/types"

/**
 * The browse row carries poster art flattened to path strings. Rebuild the art
 * shape the geometry recovery expects, so listing rows and the atlas file agree
 * on one conversion instead of two.
 */
export function browseRouteArt(route: AtlasBrowseRoute): AtlasRouteArt | null {
  if (!route.bbox || route.paths.length === 0) return null
  return {
    bbox: route.bbox,
    paths: route.paths.map((d) => ({ band: route.band, d })),
    ...route.start ? { start: route.start } : {},
    ...route.end ? { end: route.end } : {},
    aspect: route.aspect
  }
}

export interface RouteGeography {
  readonly geometry: Coordinate[]
  readonly start: Coordinate | null
  readonly end: Coordinate | null
  readonly fingerprint: string | null
}

const EMPTY: RouteGeography = { geometry: [], start: null, end: null, fingerprint: null }

/** Real-world line for a browse row, recovered from its precomputed art. */
export function browseRouteGeography(route: AtlasBrowseRoute, maxPoints = 160): RouteGeography {
  const art = browseRouteArt(route)
  if (!art) return EMPTY
  const polyline = atlasGeoPolyline(art)
  if (polyline.length < 2) return EMPTY
  const endpoints = atlasGeoEndpoints(art)
  return {
    geometry: simplifyForOverlay(polyline, maxPoints),
    start: endpoints.start,
    end: endpoints.end,
    fingerprint: atlasGeometryFingerprint(art)
  }
}
