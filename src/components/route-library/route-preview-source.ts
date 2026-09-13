import type { AtlasBrowseRoute } from "@/app/gpx-library/atlas-browse"
import type { AtlasRouteArt } from "@/lib/gpx/atlas-art"
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

/**
 * Recovered geometry, remembered per browse row and resolution.
 *
 * Typing in the search field re-ranks the catalog on every keystroke, and the
 * map redraws from the ranked result. Without this, every keystroke re-parsed
 * every surviving route's poster art — hundreds of thousands of coordinate
 * conversions to answer a question whose geometry has not changed. Browse rows
 * are stable objects from one payload, so a WeakMap both keys on identity and
 * lets a replaced catalog be collected.
 */
const recovered = new WeakMap<AtlasBrowseRoute, Map<number, RouteGeography>>()

/** Real-world line for a browse row, recovered from its precomputed art. */
export function browseRouteGeography(route: AtlasBrowseRoute, maxPoints = 160): RouteGeography {
  const byResolution = recovered.get(route) ?? new Map<number, RouteGeography>()
  const cached = byResolution.get(maxPoints)
  if (cached) return cached

  const art = browseRouteArt(route)
  const polyline = art ? atlasGeoPolyline(art) : []
  const result: RouteGeography = !art || polyline.length < 2
    ? EMPTY
    : {
        geometry: simplifyForOverlay(polyline, maxPoints),
        start: atlasGeoEndpoints(art).start,
        end: atlasGeoEndpoints(art).end,
        fingerprint: atlasGeometryFingerprint(art)
      }

  byResolution.set(maxPoints, result)
  recovered.set(route, byResolution)
  return result
}
