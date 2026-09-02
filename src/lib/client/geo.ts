/**
 * Pure geo maths shared by the route atlas and the Rides library for "rides
 * near me" ordering. No React, no browser APIs — safe to call from server
 * components and the client alike.
 */

export interface NearMeAnchor {
  readonly lat: number
  readonly lon: number
  /** Epoch ms the fix was taken; drives the cached-anchor freshness check. */
  readonly at: number
}

const EARTH_RADIUS_MILES = 3958.7613

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Great-circle distance between two `[lon, lat]` points, in miles. */
export function haversineMiles(a: readonly [number, number], b: readonly [number, number]): number {
  const dLat = toRadians(b[1] - a[1])
  const dLon = toRadians(b[0] - a[0])
  const lat1 = toRadians(a[1])
  const lat2 = toRadians(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function centerOfBbox(bbox: readonly [number, number, number, number]): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

/** Midpoint of the bounding box of a `[lon, lat]` polyline, or null when empty. */
export function centerOfPath(points: ReadonlyArray<readonly [number, number]>): [number, number] | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const point of points) {
    const [lon, lat] = point
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    if (lon < west) west = lon
    if (lon > east) east = lon
    if (lat < south) south = lat
    if (lat > north) north = lat
  }
  if (west === Infinity) return null
  return [(west + east) / 2, (south + north) / 2]
}

export function milesFromAnchor(anchor: NearMeAnchor, point: readonly [number, number]): number {
  return haversineMiles([anchor.lon, anchor.lat], point)
}

/** Rider-facing "how far away" copy; keeps the units honest at both ends. */
export function formatAway(miles: number): string {
  if (miles < 1) return "Right here"
  if (miles < 10) return `${miles.toFixed(0)} mi away`
  if (miles < 1000) return `${Math.round(miles / 5) * 5} mi away`
  return `${Math.round(miles / 50) * 50} mi away`
}
