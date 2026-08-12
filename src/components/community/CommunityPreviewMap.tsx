"use client"

import { MapTrifold } from "@phosphor-icons/react"
import type { Coordinate } from "@/lib/routing/types"

interface CommunityPreviewMapProps {
  geometry: Coordinate[][]
  ariaLabel: string
  redactedPointCount?: number
}

function points(geometry: Coordinate[], width: number, height: number): string {
  const longitudes = geometry.map(([longitude]) => longitude)
  const latitudes = geometry.map(([, latitude]) => latitude)
  const minLongitude = Math.min(...longitudes)
  const maxLongitude = Math.max(...longitudes)
  const minLatitude = Math.min(...latitudes)
  const maxLatitude = Math.max(...latitudes)
  const longitudeSpan = Math.max(0.000001, maxLongitude - minLongitude)
  const latitudeSpan = Math.max(0.000001, maxLatitude - minLatitude)
  return geometry.map(([longitude, latitude]) => {
    const x = 12 + ((longitude - minLongitude) / longitudeSpan) * (width - 24)
    const y = 12 + ((maxLatitude - latitude) / latitudeSpan) * (height - 24)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(" ")
}

export function CommunityPreviewMap({ geometry, ariaLabel, redactedPointCount = 0 }: CommunityPreviewMapProps) {
  return (
    <div className="community-preview-map" role="img" aria-label={ariaLabel}>
      <MapTrifold aria-hidden="true" />
      <svg viewBox="0 0 320 160" preserveAspectRatio="none" aria-hidden="true">
        {geometry.map((segment, index) => (
          <polyline key={index} points={points(segment, 320, 160)} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <small>{geometry.length} visible segment{geometry.length === 1 ? "" : "s"}{redactedPointCount > 0 ? ` · ${redactedPointCount} points redacted` : ""}</small>
    </div>
  )
}
