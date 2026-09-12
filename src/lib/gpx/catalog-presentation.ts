/**
 * Client-safe presentation rules for shared catalog routes.
 *
 * These helpers may clean or classify facts already present in catalog data,
 * but they must not invent route characteristics or turn unknown values into
 * confident rider-facing claims.
 */

export type CatalogBbox = readonly [number, number, number, number]

/**
 * Coarse browse filing for a shared catalog route. This is the single
 * geography authority for Route Library listing, detail, and filters.
 */
export interface CatalogArea {
  /** Broad browse bucket; one route has at most one. Null when unplaceable. */
  region: string | null
  /** Recognizable riding areas whose box holds the route centre, in list order. */
  ridingAreas: string[]
}

/**
 * Remove known bulk-import/file-sharing noise while preserving the rider's
 * actual route name. This is deliberately deterministic and non-generative.
 */
export function cleanCatalogRouteName(name: string): string {
  return name
    .trim()
    // Byline first: "Example.gpx - created by Rider" must still lose ".gpx".
    .replace(/\s*[-–—]?\s*created by\b.*$/i, "")
    .replace(/\.(?:gpx|kml|kmz)$/i, "")
    .replace(/^\d{2,}[\s._-]+(?=\D)/, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Normalize imported duration sentinels at the presentation boundary. Zero,
 * negatives, non-numbers, NaN, and infinity mean "unknown", never "0 min".
 */
export function knownDurationMinutes(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null
}

const PA_NORTH_SPLIT = 40.85
const PA_WEST_SPLIT = -78.3
const PA_EAST_SPLIT = -76.7

interface BrowseBox {
  label: string
  bbox: CatalogBbox
}

/**
 * Low-resolution Pennsylvania outline used only for catalog filing. It follows
 * the Delaware River closely enough to avoid filing nearby New Jersey routes as
 * Pennsylvania without pretending to be authoritative boundary GIS.
 */
const PENNSYLVANIA_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [-80.52, 39.72],
  [-75.79, 39.72],
  [-75.58, 39.84],
  [-75.13, 39.95],
  [-74.77, 40.22],
  [-75.14, 40.68],
  [-74.69, 41.36],
  [-75.36, 42.0],
  [-79.76, 42.0],
  [-80.52, 42.27]
]

/**
 * Intentionally coarse riding-area groupings, not county, forest, or legal
 * boundaries. A route is filed under an area only when its centre sits inside
 * the area's box: a long route whose extent merely clips an area is not
 * claimed to ride through it.
 */
const PA_RIDING_AREAS: readonly BrowseBox[] = [
  // The PA Wilds counties begin around 40.9°N; farther south is Pittsburgh-area
  // country (e.g. Armstrong County), not the Wilds.
  { label: "PA Wilds", bbox: [-79.65, 40.9, -76.65, 42.33] },
  { label: "Allegheny National Forest", bbox: [-79.35, 41.2, -78.5, 42.15] },
  { label: "Bald Eagle / Rothrock", bbox: [-78.35, 40.35, -76.65, 41.3] },
  { label: "Pine Creek", bbox: [-78.05, 41.0, -76.55, 42.2] },
  { label: "Endless Mountains", bbox: [-77.15, 41.05, -75.15, 42.25] },
  { label: "Poconos", bbox: [-75.95, 40.6, -74.6, 41.7] },
  { label: "Laurel Highlands", bbox: [-79.95, 39.65, -78.65, 40.6] },
  { label: "Michaux / Caledonia", bbox: [-78.0, 39.65, -76.75, 40.3] },
  { label: "Susquehanna Valley", bbox: [-77.45, 40.0, -75.65, 41.5] },
  { label: "Dutch Country", bbox: [-77.15, 39.65, -75.7, 40.6] },
  { label: "Bucks / Philadelphia", bbox: [-75.7, 39.7, -74.65, 40.7] }
]

/** Checked in order after the PA outline; the first box holding the centre wins. */
const OUTSIDE_PA: readonly BrowseBox[] = [
  { label: "New Jersey", bbox: [-75.6, 38.9, -73.9, 41.4] },
  { label: "New York", bbox: [-79.8, 40.5, -71.8, 45.1] },
  { label: "West Virginia & Maryland", bbox: [-82.7, 37.2, -75.0, 39.75] },
  { label: "Virginia", bbox: [-83.7, 36.5, -75.2, 39.5] },
  { label: "Ohio", bbox: [-84.9, 38.4, -80.45, 42.35] },
  { label: "New England", bbox: [-73.8, 41.0, -66.8, 47.5] },
  { label: "Europe", bbox: [-11.0, 35.0, 32.0, 60.0] }
]

function centerOfBbox(bbox: CatalogBbox): readonly [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

function contains(box: CatalogBbox, point: readonly [number, number]): boolean {
  return point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3]
}

function pointInPolygon(
  point: readonly [number, number],
  polygon: ReadonlyArray<readonly [number, number]>
): boolean {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current]!
    const b = polygon[previous]!
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses) inside = !inside
  }
  return inside
}

function pennsylvaniaRegion(point: readonly [number, number]): string {
  const north = point[1] >= PA_NORTH_SPLIT
  if (point[0] < PA_WEST_SPLIT) return north ? "Northwest PA" : "Southwest PA"
  if (point[0] < PA_EAST_SPLIT) return north ? "North-Central PA" : "South-Central PA"
  return north ? "Northeast PA" : "Southeast PA"
}

/**
 * Coarse, offline filing from real route extent. This is a browse aid, not a
 * geocoder: unknown geometry remains unplaced and no route name is consulted.
 */
export function classifyCatalogArea(bbox: CatalogBbox | null | undefined): CatalogArea {
  if (!bbox) return { region: null, ridingAreas: [] }

  const center = centerOfBbox(bbox)
  if (pointInPolygon(center, PENNSYLVANIA_OUTLINE)) {
    return {
      region: pennsylvaniaRegion(center),
      ridingAreas: PA_RIDING_AREAS.filter((area) => contains(area.bbox, center)).map((area) => area.label)
    }
  }

  const outside = OUTSIDE_PA.find((region) => contains(region.bbox, center))
  return { region: outside?.label ?? "Farther afield", ridingAreas: [] }
}
