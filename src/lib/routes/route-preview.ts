/**
 * One geographic route-preview contract shared by Explore, the GPX Library and
 * route detail.
 *
 * The Route Library listing deliberately never loads per-route geometry: 157
 * routes of raw GPS line is megabytes the browse surface must not pay. What it
 * *does* carry is the precomputed atlas poster art, and that art is an exact
 * aspect-fit Mercator projection of the route's own line into a fixed viewBox
 * (see `scripts/build-route-atlas.mjs`). Combined with the stored real-world
 * bbox the projection is invertible, so a truthful geographic line can be
 * recovered for free instead of inventing a second data pipeline.
 *
 * The recovered line is the *simplified* line — jitter-filtered, RDP-reduced,
 * Chaikin-smoothed and rounded to a tenth of a viewBox unit. At browse sizes
 * that is a faithful shape, not a claim of survey accuracy: route detail, which
 * already loads the real geometry, uses the real geometry instead.
 */

import { ATLAS_PADDING, ATLAS_VIEWBOX, type AtlasRouteArt } from "@/lib/gpx/atlas-art"
import type { Coordinate } from "@/lib/routing/types"

/** Web Mercator tile size the atlas builder projects with. */
const MERCATOR_TILE = 256
const MAX_MERCATOR_LAT = 85.05112878

/** Smallest span a degenerate bbox is widened to, in degrees (~1.1 km). */
const MIN_BBOX_SPAN_DEGREES = 0.01

/** Reference padding the design system asks previews to frame a route with. */
export const ROUTE_PREVIEW_PADDING_FRACTION = 0.13

/**
 * Bumped whenever the preview *rendering* changes in a way that invalidates
 * every cached image (basemap style, route styling, marker design).
 */
export const ROUTE_PREVIEW_STYLE_VERSION = 1

export type RoutePreviewSize = "small" | "medium" | "hero"

/** `[west, south, east, north]` in degrees. */
export type GeoBoundingBox = readonly [number, number, number, number]

export interface RoutePreviewSizeSpec {
  readonly width: number
  readonly height: number
  /** Device pixel multiplier the renderer should capture at. */
  readonly pixelRatio: number
}

/**
 * List cards and the selected Explore card are the only two densities the
 * phone layouts need; the hero size serves the route-detail summary map when a
 * still image is enough. Keeping them named stops every call site inventing sizes
 * that each miss the cache.
 */
export const ROUTE_PREVIEW_SIZES: Readonly<Record<RoutePreviewSize, RoutePreviewSizeSpec>> = {
  // Each size matches the shape of the box it fills. A square render inside a
  // landscape card is cropped by `object-fit: cover`, and what gets cropped is
  // the edge of the frame — where the town names are.
  small: { width: 176, height: 124, pixelRatio: 2 },
  medium: { width: 320, height: 112, pixelRatio: 2 },
  hero: { width: 720, height: 360, pixelRatio: 2 }
}

export interface RoutePreviewSpecInput {
  readonly routeId: string
  readonly bbox: GeoBoundingBox | null | undefined
  readonly size: RoutePreviewSize
  readonly styleId: string
  /** Distinguishes two routes that share a bbox but not a line. */
  readonly geometryFingerprint?: string | null
  readonly paddingFraction?: number
}

export interface RoutePreviewSpec {
  /** Deterministic cache key: same inputs always name the same image. */
  readonly key: string
  readonly routeId: string
  /** Padded frame the renderer must fit, never the raw route extent. */
  readonly bbox: GeoBoundingBox
  readonly width: number
  readonly height: number
  readonly pixelRatio: number
  readonly styleId: string
  readonly size: RoutePreviewSize
}

export function mercatorY(latitude: number): number {
  const clamped = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, latitude))
  const sin = Math.sin((clamped * Math.PI) / 180)
  return (MERCATOR_TILE / (2 * Math.PI)) * Math.log((1 + sin) / (1 - sin))
}

export function latitudeFromMercatorY(y: number): number {
  const k = (y * 2 * Math.PI) / MERCATOR_TILE
  return (Math.asin(Math.tanh(k / 2)) * 180) / Math.PI
}

function isFiniteBbox(bbox: GeoBoundingBox | null | undefined): bbox is GeoBoundingBox {
  return Array.isArray(bbox) && bbox.length === 4 && bbox.every((value) => Number.isFinite(value))
}

function clampLongitude(value: number): number {
  return Math.max(-180, Math.min(180, value))
}

function clampLatitude(value: number): number {
  return Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, value))
}

/**
 * Frame a route with breathing room. A point route (one waypoint, or a bbox
 * rounded to nothing) is widened to a small readable neighbourhood rather than
 * asking the renderer to fit a zero-area box at infinite zoom.
 */
export function padBoundingBox(
  bbox: GeoBoundingBox,
  fraction: number = ROUTE_PREVIEW_PADDING_FRACTION
): GeoBoundingBox {
  const [west, south, east, north] = bbox
  const safeFraction = Number.isFinite(fraction) && fraction >= 0 ? fraction : ROUTE_PREVIEW_PADDING_FRACTION
  const rawWidth = Math.abs(east - west)
  const rawHeight = Math.abs(north - south)
  const width = Math.max(rawWidth, MIN_BBOX_SPAN_DEGREES)
  const height = Math.max(rawHeight, MIN_BBOX_SPAN_DEGREES)
  const centreX = (west + east) / 2
  const centreY = (south + north) / 2
  const halfWidth = (width / 2) * (1 + safeFraction)
  const halfHeight = (height / 2) * (1 + safeFraction)
  return [
    clampLongitude(centreX - halfWidth),
    clampLatitude(centreY - halfHeight),
    clampLongitude(centreX + halfWidth),
    clampLatitude(centreY + halfHeight)
  ]
}

/** Round a bbox for cache keys so sub-metre jitter cannot fragment the cache. */
function bboxKey(bbox: GeoBoundingBox): string {
  return bbox.map((value) => value.toFixed(4)).join(",")
}

/**
 * The preview contract the plan asks for:
 * `routeId + geometry fingerprint + padded bbox + style version + size -> key`.
 */
export function buildRoutePreviewSpec(input: RoutePreviewSpecInput): RoutePreviewSpec {
  const dimensions = ROUTE_PREVIEW_SIZES[input.size]
  const source: GeoBoundingBox = isFiniteBbox(input.bbox) ? input.bbox : [-180, -60, 180, 75]
  const bbox = padBoundingBox(source, input.paddingFraction)
  const fingerprint = input.geometryFingerprint?.trim() || "no-line"
  return {
    key: [
      "rp",
      ROUTE_PREVIEW_STYLE_VERSION,
      input.styleId,
      input.size,
      `${dimensions.width}x${dimensions.height}@${dimensions.pixelRatio}`,
      input.routeId,
      fingerprint,
      bboxKey(bbox)
    ].join("|"),
    routeId: input.routeId,
    bbox,
    width: dimensions.width,
    height: dimensions.height,
    pixelRatio: dimensions.pixelRatio,
    styleId: input.styleId,
    size: input.size
  }
}

/**
 * Cheap, stable fingerprint of an atlas art record. Two routes with identical
 * art share a preview; a re-import that moves the line does not.
 */
export function atlasGeometryFingerprint(art: Pick<AtlasRouteArt, "paths"> | null | undefined): string | null {
  if (!art || art.paths.length === 0) return null
  let hash = 0x811c9dc5
  for (const piece of art.paths) {
    for (let index = 0; index < piece.d.length; index += 1) {
      hash ^= piece.d.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
  }
  return `${art.paths.length}-${hash.toString(36)}`
}

interface ViewboxProjection {
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
  readonly west: number
  readonly northMercator: number
}

/**
 * Rebuild the exact aspect-fit transform `build-route-atlas.mjs` used, so the
 * poster coordinates can be read back as longitude/latitude.
 */
function viewboxProjection(bbox: GeoBoundingBox): ViewboxProjection | null {
  const [west, south, east, north] = bbox
  const spanX = east - west
  const spanY = mercatorY(north) - mercatorY(south)
  if (!(spanX > 0) || !(spanY > 0)) return null
  const boxWidth = ATLAS_VIEWBOX.width - ATLAS_PADDING * 2
  const boxHeight = ATLAS_VIEWBOX.height - ATLAS_PADDING * 2
  const scale = Math.min(boxWidth / spanX, boxHeight / spanY)
  return {
    scale,
    offsetX: ATLAS_PADDING + (boxWidth - spanX * scale) / 2,
    offsetY: ATLAS_PADDING + (boxHeight - spanY * scale) / 2,
    west,
    northMercator: mercatorY(north)
  }
}

function toCoordinate(projection: ViewboxProjection, x: number, y: number): Coordinate {
  const longitude = projection.west + (x - projection.offsetX) / projection.scale
  const mercator = projection.northMercator - (y - projection.offsetY) / projection.scale
  return [
    Number(clampLongitude(longitude).toFixed(6)),
    Number(clampLatitude(latitudeFromMercatorY(mercator)).toFixed(6))
  ]
}

/** `M x y L x y L x y` — the only command shape the atlas builder emits. */
function parseViewboxPath(d: string): Array<readonly [number, number]> {
  const points: Array<readonly [number, number]> = []
  const tokens = d.match(/-?\d+(?:\.\d+)?/g)
  if (!tokens) return points
  for (let index = 0; index + 1 < tokens.length; index += 2) {
    const x = Number(tokens[index])
    const y = Number(tokens[index + 1])
    if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y])
  }
  return points
}

export interface AtlasGeoLine {
  readonly coordinates: Coordinate[]
  /** Curvature band the atlas assigned this chunk, for consistent styling. */
  readonly band: AtlasRouteArt["paths"][number]["band"]
}

/**
 * Recover real-world route lines from precomputed atlas poster art. Returns an
 * empty array when the art carries no bbox — an unplaceable route gets an
 * honest "no geography" state, never a line drawn somewhere it never went.
 */
export function atlasGeoLines(art: AtlasRouteArt | null | undefined): AtlasGeoLine[] {
  if (!art || !isFiniteBbox(art.bbox)) return []
  const projection = viewboxProjection(art.bbox)
  if (!projection) return []
  const lines: AtlasGeoLine[] = []
  for (const piece of art.paths) {
    const points = parseViewboxPath(piece.d)
    if (points.length < 2) continue
    lines.push({
      band: piece.band,
      coordinates: points.map(([x, y]) => toCoordinate(projection, x, y))
    })
  }
  return lines
}

/** Flatten recovered lines into one continuous polyline for simple renderers. */
export function atlasGeoPolyline(art: AtlasRouteArt | null | undefined): Coordinate[] {
  const lines = atlasGeoLines(art)
  const flattened: Coordinate[] = []
  for (const line of lines) {
    for (const coordinate of line.coordinates) {
      const previous = flattened[flattened.length - 1]
      if (previous && previous[0] === coordinate[0] && previous[1] === coordinate[1]) continue
      flattened.push(coordinate)
    }
  }
  return flattened
}

/** Recover the marker positions the atlas stored in viewBox units. */
export function atlasGeoEndpoints(art: AtlasRouteArt | null | undefined): {
  start: Coordinate | null
  end: Coordinate | null
} {
  if (!art || !isFiniteBbox(art.bbox)) return { start: null, end: null }
  const projection = viewboxProjection(art.bbox)
  if (!projection) return { start: null, end: null }
  return {
    start: art.start ? toCoordinate(projection, art.start[0], art.start[1]) : null,
    end: art.end ? toCoordinate(projection, art.end[0], art.end[1]) : null
  }
}

/** Bounding box of a real geometry line, for previews that do have geometry. */
export function boundingBoxOf(geometry: ReadonlyArray<Coordinate>): GeoBoundingBox | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [longitude, latitude] of geometry) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    if (longitude < west) west = longitude
    if (longitude > east) east = longitude
    if (latitude < south) south = latitude
    if (latitude > north) north = latitude
  }
  return Number.isFinite(west) && Number.isFinite(south) && Number.isFinite(east) && Number.isFinite(north)
    ? [west, south, east, north]
    : null
}

/**
 * Reduce a line to at most `maxPoints` while keeping its ends and overall
 * shape. Explore draws every filtered route at once; full chunk resolution per
 * route is detail nobody can see at browse zoom and geometry the map has to
 * re-upload on every selection change.
 */
export function simplifyForOverlay(geometry: ReadonlyArray<Coordinate>, maxPoints = 96): Coordinate[] {
  if (geometry.length <= maxPoints) return [...geometry]
  if (maxPoints < 2) return geometry.length > 0 ? [geometry[0]!] : []
  const step = (geometry.length - 1) / (maxPoints - 1)
  const out: Coordinate[] = []
  for (let index = 0; index < maxPoints; index += 1) {
    out.push(geometry[Math.round(index * step)]!)
  }
  return out
}
