import type { CoordinatePoint, NormalizedPoint, NormalizePointOptions } from "./graphics-types"

export function finiteNumber(value: number): number | null {
  return Number.isFinite(value) ? value : null
}

export function clamp01(value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Math.min(1, Math.max(0, value))
}

export function normalizePoints(
  points: ReadonlyArray<CoordinatePoint>,
  options: NormalizePointOptions
): NormalizedPoint[] {
  const width = finiteNumber(options.width)
  const height = finiteNumber(options.height)
  const padding = finiteNumber(options.padding)
  if (width === null || height === null || padding === null || width <= 0 || height <= 0 || padding < 0) return []

  const innerWidth = Math.max(0, width - padding * 2)
  const innerHeight = Math.max(0, height - padding * 2)
  const valid = points.flatMap(([x, y]) => Number.isFinite(x) && Number.isFinite(y) ? [[x, y] as const] : [])
  if (valid.length === 0) return []

  let minX = valid[0]![0]
  let maxX = valid[0]![0]
  let minY = valid[0]![1]
  let maxY = valid[0]![1]
  for (let index = 1; index < valid.length; index += 1) {
    const [x, y] = valid[index]!
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const spanX = maxX - minX
  const spanY = maxY - minY
  const scaleX = spanX > 0 ? innerWidth / spanX : Number.POSITIVE_INFINITY
  const scaleY = spanY > 0 ? innerHeight / spanY : Number.POSITIVE_INFINITY
  const finiteScales = [scaleX, scaleY].filter(Number.isFinite)
  const scale = finiteScales.length > 0 ? Math.min(...finiteScales) : 0
  const drawWidth = spanX * scale
  const drawHeight = spanY * scale
  const offsetX = padding + (innerWidth - drawWidth) / 2
  const offsetY = padding + (innerHeight - drawHeight) / 2

  return valid.map(([x, y]) => ({
    x: spanX === 0 ? width / 2 : offsetX + (x - minX) * scale,
    y: spanY === 0 ? height / 2 : offsetY + (maxY - y) * scale
  }))
}

/**
 * Project `[longitude, latitude]` degrees onto a locally equal-aspect plane.
 *
 * Plotting degrees directly stretches a route horizontally by `1/cos(lat)` —
 * about 1.31x across Pennsylvania — so a thumbnail drawn from raw degrees is
 * not the shape the rider rode. Scaling longitude by the cosine of the route's
 * mean latitude keeps the drawn shape faithful over the span of one ride.
 * Latitude passes through unchanged: `normalizePoints` already flips the y
 * axis, so north ends up at the top of the drawing.
 */
export function projectGeographicPoints(
  points: ReadonlyArray<CoordinatePoint>
): CoordinatePoint[] {
  const valid = points.flatMap(([longitude, latitude]) =>
    Number.isFinite(longitude) && Number.isFinite(latitude) ? [[longitude, latitude] as const] : [])
  if (valid.length === 0) return []

  const meanLatitude = valid.reduce((sum, [, latitude]) => sum + latitude, 0) / valid.length
  // Guard the poles so a degenerate scale can never collapse the drawing.
  const longitudeScale = Math.max(0.15, Math.cos(meanLatitude * Math.PI / 180))
  return valid.map(([longitude, latitude]) => [longitude * longitudeScale, latitude] as CoordinatePoint)
}
