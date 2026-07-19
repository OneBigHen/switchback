import type { Coordinate } from "@/lib/routing/types"

export interface ReferenceMapBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface ReferenceMap {
  id: string
  name: string
  url: string
  coordinates: Coordinate[]
  opacity: number
}

export function boundsToReferenceCorners(bounds: ReferenceMapBounds): Coordinate[] {
  return [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south]
  ]
}

export function normalizeReferenceMap(reference: ReferenceMap): ReferenceMap {
  if (!reference.url.startsWith("data:image/")) {
    throw new Error("Reference map must be an image kept on this device.")
  }
  if (reference.coordinates.length !== 4 || reference.coordinates.some(([longitude, latitude]) => (
    !Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90
  ))) {
    throw new Error("Reference map needs four valid map alignment corners.")
  }
  return {
    ...reference,
    name: reference.name.trim().slice(0, 80) || "Reference map",
    opacity: Math.max(0.1, Math.min(1, reference.opacity))
  }
}
