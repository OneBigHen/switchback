import type { Coordinate } from "@/lib/routing/types"

const WIDTH = 320
const HEIGHT = 180
const PADDING = 18

interface ProjectedPoint {
  x: number
  y: number
}

function finiteGeometry(geometry: readonly Coordinate[]): Coordinate[] {
  return geometry.filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
}

function projected(geometry: readonly Coordinate[]): ProjectedPoint[] {
  const points = finiteGeometry(geometry)
  if (points.length === 0) return []

  const meanLatitude = points.reduce((sum, point) => sum + point[1], 0) / points.length
  const longitudeScale = Math.max(0.15, Math.cos(meanLatitude * Math.PI / 180))
  const raw = points.map(([lon, lat]) => ({ x: lon * longitudeScale, y: -lat }))
  const minX = Math.min(...raw.map((point) => point.x))
  const maxX = Math.max(...raw.map((point) => point.x))
  const minY = Math.min(...raw.map((point) => point.y))
  const maxY = Math.max(...raw.map((point) => point.y))
  const spanX = Math.max(maxX - minX, 0.000001)
  const spanY = Math.max(maxY - minY, 0.000001)
  const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY)
  const drawnWidth = spanX * scale
  const drawnHeight = spanY * scale
  const offsetX = (WIDTH - drawnWidth) / 2
  const offsetY = (HEIGHT - drawnHeight) / 2

  return raw.map((point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (point.y - minY) * scale
  }))
}

function pathData(points: readonly ProjectedPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")
}

export interface RouteGeometryPreviewProps {
  geometry: readonly Coordinate[]
  label: string
}

/**
 * Cheap, offline-safe card preview derived only from the stored polyline.
 * It deliberately contains no synthetic scenery: the shape is the ride.
 */
export function RouteGeometryPreview({ geometry, label }: RouteGeometryPreviewProps) {
  const points = projected(geometry)
  if (points.length < 2) return null
  const first = points[0]!
  const last = points[points.length - 1]!

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Route preview for ${label}`}
      data-route-geometry-preview="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d={pathData(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.9"
      />
      <circle cx={first.x} cy={first.y} r="7" fill="currentColor" />
      <circle cx={last.x} cy={last.y} r="7" fill="var(--sb-ember-strong)" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
