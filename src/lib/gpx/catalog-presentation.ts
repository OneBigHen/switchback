/**
 * Client-safe presentation rules for shared catalog routes.
 *
 * These helpers may clean or classify facts already present in catalog data,
 * but they must not invent route characteristics or turn unknown values into
 * confident rider-facing claims.
 */

export type CatalogBbox = readonly [number, number, number, number]

export interface CatalogArea {
  region: string | null
  ridingArea: string | null
}

/**
 * Remove known bulk-import/file-sharing noise while preserving the rider's
 * actual route name. This is deliberately deterministic and non-generative.
 */
export function cleanCatalogRouteName(name: string): string {
  return name
    .trim()
    .replace(/\.(?:gpx|kml|kmz)$/i, "")
    .replace(/\s*[-–—]?\s*created by\b.*$/i, "")
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

const BALD_EAGLE_ROTHROCK: CatalogBbox = [-78.35, 40.35, -76.65, 41.3]
const NEW_JERSEY: CatalogBbox = [-75.6, 38.9, -73.9, 41.4]

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
  if (!bbox) return { region: null, ridingArea: null }

  const center = centerOfBbox(bbox)
  if (pointInPolygon(center, PENNSYLVANIA_OUTLINE)) {
    return {
      region: pennsylvaniaRegion(center),
      ridingArea: contains(BALD_EAGLE_ROTHROCK, center) ? "Bald Eagle / Rothrock" : null
    }
  }

  if (contains(NEW_JERSEY, center)) return { region: "New Jersey", ridingArea: null }
  return { region: "Farther afield", ridingArea: null }
}
