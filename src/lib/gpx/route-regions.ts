export type RouteBbox = readonly [number, number, number, number]

export interface RouteGeography {
  /** Broad rider-facing browse bucket. One route has at most one macro region. */
  macroRegion: string | null
  /** Recognizable riding areas the route intersects. A route may span several. */
  ridingAreas: string[]
}

interface BrowseBox {
  label: string
  bbox: RouteBbox
}

const PA_NORTH_SPLIT = 40.85
const PA_WEST_SPLIT = -78.3
const PA_EAST_SPLIT = -76.7

/**
 * A deliberately low-resolution PA outline used only to decide whether a route
 * centroid belongs in the PA browse hierarchy. A single rectangle mislabeled
 * central New Jersey as Southeast PA; this small polygon follows the Delaware
 * River closely enough for discovery without adding a GIS dataset or geocoder.
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
 * These are intentionally coarse browse groupings, not county, forest, or legal
 * boundaries. They answer "what part of PA is this ride in?" without adding a
 * geocoder or pretending Switchback has authoritative GIS boundary data.
 */
const PA_RIDING_AREAS: readonly BrowseBox[] = [
  { label: "PA Wilds", bbox: [-79.65, 40.65, -76.65, 42.33] },
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

const OUTSIDE_PA: readonly BrowseBox[] = [
  { label: "New Jersey", bbox: [-75.6, 38.9, -73.9, 41.4] },
  { label: "New York", bbox: [-79.8, 40.5, -71.8, 45.1] },
  { label: "West Virginia & Maryland", bbox: [-82.7, 37.2, -75.0, 39.75] },
  { label: "Virginia", bbox: [-83.7, 36.5, -75.2, 39.5] },
  { label: "Ohio", bbox: [-84.9, 38.4, -80.45, 42.35] },
  { label: "New England", bbox: [-73.8, 41.0, -66.8, 47.5] },
  { label: "Europe", bbox: [-11.0, 35.0, 32.0, 60.0] }
]

function center(bbox: RouteBbox): readonly [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

function contains(box: RouteBbox, point: readonly [number, number]): boolean {
  return point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3]
}

function intersects(left: RouteBbox, right: RouteBbox): boolean {
  return left[0] <= right[2] && left[2] >= right[0] && left[1] <= right[3] && left[3] >= right[1]
}

function pointInPolygon(point: readonly [number, number], polygon: ReadonlyArray<readonly [number, number]>): boolean {
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

function paMacroRegion(point: readonly [number, number]): string {
  const north = point[1] >= PA_NORTH_SPLIT
  if (point[0] < PA_WEST_SPLIT) return north ? "Northwest PA" : "Southwest PA"
  if (point[0] < PA_EAST_SPLIT) return north ? "North-Central PA" : "South-Central PA"
  return north ? "Northeast PA" : "Southeast PA"
}

/**
 * Classify a route from its real geographic extent. No network calls and no
 * invented per-route metadata: missing geometry remains unplaced.
 */
export function classifyRouteGeography(bbox: RouteBbox | null | undefined): RouteGeography {
  if (!bbox) return { macroRegion: null, ridingAreas: [] }

  const routeCenter = center(bbox)
  if (pointInPolygon(routeCenter, PENNSYLVANIA_OUTLINE)) {
    return {
      macroRegion: paMacroRegion(routeCenter),
      ridingAreas: PA_RIDING_AREAS.filter((area) => intersects(bbox, area.bbox)).map((area) => area.label)
    }
  }

  const outside = OUTSIDE_PA.find((region) => contains(region.bbox, routeCenter))
  return {
    macroRegion: outside?.label ?? "Farther afield",
    ridingAreas: []
  }
}

export const PA_MACRO_REGIONS = [
  "Northwest PA",
  "North-Central PA",
  "Northeast PA",
  "Southwest PA",
  "South-Central PA",
  "Southeast PA"
] as const

export const PA_RIDING_AREA_LABELS = PA_RIDING_AREAS.map((area) => area.label)
