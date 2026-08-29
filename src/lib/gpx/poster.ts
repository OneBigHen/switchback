import type { Coordinate } from "@/lib/routing/types"
import { curvatureRampColor } from "@/lib/gpx/atlas"

/**
 * Poster rendering for the route atlas: turns raw route geometry into
 * prettymaps-style framed poster paths (Mercator-projected so shapes are not
 * stretched), with per-segment curvature color and optional start/end marks.
 */

const TILE = 256
const MAX_LATITUDE = 85.05112878

export interface PosterPoint {
  readonly x: number
  readonly y: number
}

export interface PosterSegment {
  /** SVG path data for this contiguous piece of the route. */
  readonly path: string
  /** Average curvature of this segment, 0-100. */
  readonly curvature: number
  readonly heat: number
  readonly color: string
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
  readonly segments: readonly PosterSegment[]
  /** Start marker position in viewBox units. */
  readonly start: PosterPoint
  /** End marker position in viewBox units. */
  readonly end: PosterPoint
}

export interface PosterOptions {
  readonly width?: number
  readonly height?: number
  readonly padding?: number
  /** Max vertices per rendered segment; longer pieces get decimated evenly. */
  readonly maxPointsPerSegment?: number
}

const DEFAULT_MAX_POINTS = 350

function finitePositive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback
}

export function buildPosterSpec(geometry: Coordinate[], options: PosterOptions = {}): PosterSpec | null {
  const width = finitePositive(options.width, 600)
  const height = finitePositive(options.height, 750)
  const rawPadding = finiteNonNegative(options.padding, 40)
  const padding = Math.min(rawPadding, Math.max(0, Math.min(width, height) / 2 - 0.5))
  const maxPoints = Math.max(2, Math.floor(finitePositive(options.maxPointsPerSegment, DEFAULT_MAX_POINTS)))
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
  const rankedHeat = [...heat].sort((a, b) => a - b)
  const heatReference = Math.max(4, rankedHeat[Math.floor(rankedHeat.length * 0.95)] ?? 4)

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
    const normalizedHeat = Math.pow(Math.min(1, (peak ?? 0) / heatReference), 0.85)
    return {
      path:
        `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} ` +
        pts.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "),
      curvature: peak ?? 0,
      heat: normalizedHeat,
      color: curvatureRampColor(normalizedHeat)
    }
  })

  return { segments, start: view[0], end: view[view.length - 1] }
}
