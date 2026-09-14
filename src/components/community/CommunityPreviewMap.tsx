"use client"

import { MapTrifold } from "@phosphor-icons/react"
import type { Coordinate } from "@/lib/routing/types"

interface CommunityPreviewMapProps {
  geometry: Coordinate[][]
  ariaLabel: string
  redactedPointCount?: number
}

const VIEW_WIDTH = 320
const VIEW_HEIGHT = 160
const INSET = 12

/**
 * One projection for every segment, scaled uniformly and centred. Each segment
 * used to be stretched to the full box on its own, so a route in two pieces
 * drew two overlapping full-size shapes, and a north–south ride was squashed
 * flat by `preserveAspectRatio="none"`.
 */
function projector(geometry: Coordinate[][]): (point: Coordinate) => string {
  const all = geometry.flat()
  const longitudes = all.map(([longitude]) => longitude)
  const latitudes = all.map(([, latitude]) => latitude)
  const minLongitude = Math.min(...longitudes)
  const maxLongitude = Math.max(...longitudes)
  const minLatitude = Math.min(...latitudes)
  const maxLatitude = Math.max(...latitudes)
  // A degree of longitude shrinks with latitude; without this, Pennsylvania
  // draws a third wider than it is.
  const xScale = Math.cos(((minLatitude + maxLatitude) / 2) * (Math.PI / 180))
  const spanX = Math.max(0.000001, (maxLongitude - minLongitude) * xScale)
  const spanY = Math.max(0.000001, maxLatitude - minLatitude)
  const scale = Math.min((VIEW_WIDTH - INSET * 2) / spanX, (VIEW_HEIGHT - INSET * 2) / spanY)
  const offsetX = (VIEW_WIDTH - spanX * scale) / 2
  const offsetY = (VIEW_HEIGHT - spanY * scale) / 2
  return ([longitude, latitude]) => {
    const x = offsetX + (longitude - minLongitude) * xScale * scale
    const y = offsetY + (maxLatitude - latitude) * scale
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }
}

export function CommunityPreviewMap({ geometry, ariaLabel, redactedPointCount = 0 }: CommunityPreviewMapProps) {
  const project = projector(geometry.filter((segment) => segment.length > 0))
  return (
    <div className="community-preview-map" role="img" aria-label={ariaLabel}>
      <MapTrifold aria-hidden="true" />
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} aria-hidden="true">
        {geometry.map((segment, index) => (
          <polyline key={index} points={segment.map(project).join(" ")} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <small>{geometry.length} visible segment{geometry.length === 1 ? "" : "s"}{redactedPointCount > 0 ? ` · ${redactedPointCount} points redacted` : ""}</small>
    </div>
  )
}
