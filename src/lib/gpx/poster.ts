import type { Coordinate } from "@/lib/routing/types"

/**
 * Poster rendering for the route atlas: turns raw route geometry into
 * prettymaps-style framed poster paths (Mercator-projected so shapes are not
 * stretched), with per-segment curvature color and optional start/end marks.
 */

const TILE = 256
const MAX_LATITUDE = 85.05112878

export interface PosterPoint {
  x: number
  y: number
}

export interface PosterSegment {
  /** SVG path data for this contiguous piece of the route. */
  path: string
  /** Average curvature of this segment, 0-100. */
  curvature: number
}

function mercatorY(latitude: number): number {
  const lat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude))
  const sin = Math.sin((lat * Math.PI) / 180)
  return (TILE / (2 * Math.PI)) * Math.log((1 + sin) / (1 - sin))
}

function project(points: Coordinate[]): PosterPoint[] {
  return points.map(([longitude, latitude]) => ({ x: longitude, y: mercatorY(latitude) }))
}

/** Curvature proxy per vertex: exterior angle scaled by local point density. */
function curvatures(points: PosterPoint[]): number[] {
  const n = points.length
  if (n < 3) return points.map(() => 0)
  const out = new Array<number>(n).fill(0)
  for (let i = 1; i < n - 1; i += 1) {
    const ax = points[i].x - points[i - 1].x
    const ay = points[i].y - points[i - 1].y
    const bx = points[i + 1].x - points[i].x
    const by = points[i + 1].y - points[i].y
    const la = Math.hypot(ax, ay)
    const lb = Math.hypot(bx, by)
    if (la < 1e-12 || lb < 1e-12) continue
    let dot = (ax * bx + ay * by) / (la * lb)
    dot = Math.max(-1, Math.min(1, dot))
    out[i] = (Math.acos(dot) * 180) / Math.PI
  }
  out[0] = out[1]
  out[n - 1] = out[n - 2]
  return out
}

function smooth(values: number[], window = 5): number[] {
  if (values.length < window) return values
  const half = Math.floor(window / 2)
  return values.map((_, i) => {
    let sum = 0
    let count = 0
    for (let j = i - half; j <= i + half; j += 1) {
      if (j >= 0 && j < values.length) {
        sum += values[j]
        count += 1
      }
    }
    return count > 0 ? sum / count : 0
  })
}

export interface PosterSpec {
  segments: PosterSegment[]
  /** Start marker position in viewBox units. */
  start: PosterPoint
  /** End marker position in viewBox units. */
  end: PosterPoint
}

export interface PosterOptions {
  width?: number
  height?: number
  padding?: number
  /** Max vertices per rendered segment; longer pieces get decimated evenly. */
  maxPointsPerSegment?: number
}

const DEFAULT_MAX_POINTS = 350

export function buildPosterSpec(geometry: Coordinate[], options: PosterOptions = {}): PosterSpec | null {
  const width = options.width ?? 600
  const height = options.height ?? 750
  const padding = options.padding ?? 40
  const maxPoints = options.maxPointsPerSegment ?? DEFAULT_MAX_POINTS
  if (!Array.isArray(geometry) || geometry.length < 2) return null

  const projectedAll = project(geometry.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1])))
  if (projectedAll.length < 2) return null
  // Cap vertex count up front so rendered posters stay lightweight.
  const projected = projectedAll.length > 1400 ? (() => {
    const step = (projectedAll.length - 1) / 1399
    const out: PosterPoint[] = []
    for (let i = 0; i < 1400; i += 1) out.push(projectedAll[Math.round(i * step)])
    out[out.length - 1] = projectedAll[projectedAll.length - 1]
    return out
  })() : projectedAll

  const minX = Math.min(...projected.map((p) => p.x))
  const maxX = Math.max(...projected.map((p) => p.x))
  const minY = Math.min(...projected.map((p) => p.y))
  const maxY = Math.max(...projected.map((p) => p.y))
  const spanX = Math.max(1e-9, maxX - minX)
  const spanY = Math.max(1e-9, maxY - minY)

  // Aspect-fit inside (width-2p) x (height-2p).
  const boxW = width - padding * 2
  const boxH = height - padding * 2
  const scale = Math.min(boxW / spanX, boxH / spanY)
  const offsetX = padding + (boxW - spanX * scale) / 2
  const offsetY = padding + (boxH - spanY * scale) / 2

  const toView = (p: PosterPoint): PosterPoint => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + (maxY - p.y) * scale
  })

  const view = projected.map(toView)
  const heat = smooth(curvatures(projected))

  const chunks: Array<{ pts: PosterPoint[]; heat: number[] }> = []
  for (let i = 0; i < view.length; i += maxPoints) {
    const slice = view.slice(i, i + maxPoints + 1)
    const heatSlice = heat.slice(i, i + maxPoints + 1)
    if (slice.length >= 2) chunks.push({ pts: slice, heat: heatSlice })
  }
  if (chunks.length === 0) return null

  const segments = chunks.map(({ pts, heat: chunkHeat }) => {
    // Peak corner intensity (p90) so real corners color their stretch.
    const sorted = [...chunkHeat].sort((a, b) => a - b)
    const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]
    return {
      path:
        `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} ` +
        pts.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "),
      curvature: peak
    }
  })

  return { segments, start: view[0], end: view[view.length - 1] }
}
