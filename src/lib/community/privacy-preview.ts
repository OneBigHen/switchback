import type { Coordinate, RouteInstruction } from "@/lib/routing/types"

export interface PrivacyZone {
  center: Coordinate
  radiusMeters: number
}

export interface PublishPrivacyPreview {
  publicGeometry: Coordinate[][]
  publicInstructions: RouteInstruction[]
  publicDistanceMiles: number
  publicDurationMinutes: number
  redactedPointCount: number
  redactedInstructionCount: number
  exactPreviewRequired: true
}

const EARTH_RADIUS_METERS = 6_371_000

function distanceMeters(a: Coordinate, b: Coordinate): number {
  const lat1 = a[1] * Math.PI / 180
  const lat2 = b[1] * Math.PI / 180
  const dLat = lat2 - lat1
  const dLon = (b[0] - a[0]) * Math.PI / 180
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

function lineLength(geometry: Coordinate[]): number {
  let total = 0
  for (let index = 1; index < geometry.length; index += 1) total += distanceMeters(geometry[index - 1]!, geometry[index]!)
  return total
}

function pointAt(geometry: Coordinate[], targetMeters: number): Coordinate {
  if (targetMeters <= 0) return geometry[0]!
  let travelled = 0
  for (let index = 1; index < geometry.length; index += 1) {
    const from = geometry[index - 1]!
    const to = geometry[index]!
    const span = distanceMeters(from, to)
    if (travelled + span >= targetMeters && span > 0) {
      const ratio = (targetMeters - travelled) / span
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]
    }
    travelled += span
  }
  return geometry.at(-1)!
}

function trimGeometry(geometry: Coordinate[], startMeters: number, endMeters: number): Coordinate[] {
  const total = lineLength(geometry)
  const start = Math.max(0, Math.min(startMeters, total))
  const end = Math.max(start, Math.min(total - Math.max(0, endMeters), total))
  if (geometry.length < 2 || end <= start) return []
  const points: Coordinate[] = [pointAt(geometry, start)]
  let travelled = 0
  for (let index = 1; index < geometry.length; index += 1) {
    const next = travelled + distanceMeters(geometry[index - 1]!, geometry[index]!)
    if (next > start && next < end) points.push(geometry[index]!)
    travelled = next
  }
  points.push(pointAt(geometry, end))
  return points.filter((point, index) => index === 0 || point[0] !== points[index - 1]![0] || point[1] !== points[index - 1]![1])
}

function insideZone(point: Coordinate, zones: PrivacyZone[]): boolean {
  return zones.some((zone) => Number.isFinite(zone.radiusMeters) && zone.radiusMeters > 0 && distanceMeters(point, zone.center) <= zone.radiusMeters)
}

function pointSegmentDistanceMeters(point: Coordinate, start: Coordinate, finish: Coordinate): number {
  const latitudeScale = 111_320
  const longitudeScale = Math.cos(point[1] * Math.PI / 180) * latitudeScale
  const ax = (start[0] - point[0]) * longitudeScale
  const ay = (start[1] - point[1]) * latitudeScale
  const bx = (finish[0] - point[0]) * longitudeScale
  const by = (finish[1] - point[1]) * latitudeScale
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared))
  return Math.hypot(ax + ratio * dx, ay + ratio * dy)
}

function segmentInsideZone(start: Coordinate, finish: Coordinate, zones: PrivacyZone[]): boolean {
  return zones.some((zone) => Number.isFinite(zone.radiusMeters) && zone.radiusMeters > 0 && pointSegmentDistanceMeters(zone.center, start, finish) <= zone.radiusMeters)
}

function splitPrivatePoints(geometry: Coordinate[], zones: PrivacyZone[]): { segments: Coordinate[][]; privateIndexes: Set<number>; privateEdges: Set<number> } {
  const privateIndexes = new Set<number>()
  geometry.forEach((point, index) => { if (insideZone(point, zones)) privateIndexes.add(index) })
  const privateEdges = new Set<number>()
  for (let index = 1; index < geometry.length; index += 1) {
    if (privateIndexes.has(index - 1) || privateIndexes.has(index) || segmentInsideZone(geometry[index - 1]!, geometry[index]!, zones)) {
      privateEdges.add(index - 1)
    }
  }
  if (privateIndexes.size === 0 && privateEdges.size === 0) {
    return { segments: geometry.length >= 2 ? [geometry] : [], privateIndexes, privateEdges }
  }
  const segments: Coordinate[][] = []
  let current: Coordinate[] = []
  for (let index = 0; index < geometry.length - 1; index += 1) {
    if (privateEdges.has(index)) {
      if (current.length >= 2) segments.push(current)
      current = []
      continue
    }
    if (current.length === 0) current.push(geometry[index]!)
    current.push(geometry[index + 1]!)
  }
  if (current.length >= 2) segments.push(current)
  return { segments, privateIndexes, privateEdges }
}

function trimInstructionIndexes(geometry: Coordinate[], startMeters: number, endMeters: number): { first: number; last: number } {
  const total = lineLength(geometry)
  const start = Math.max(0, Math.min(startMeters, total))
  const end = Math.max(start, Math.min(total - Math.max(0, endMeters), total))
  let first = 0
  let last = geometry.length - 1
  let travelled = 0
  if (start > 0) {
    for (let index = 1; index < geometry.length; index += 1) {
      travelled += distanceMeters(geometry[index - 1]!, geometry[index]!)
      if (travelled >= start) {
        first = index
        break
      }
    }
  }
  travelled = 0
  if (end < total) {
    for (let index = 1; index < geometry.length; index += 1) {
      const next = travelled + distanceMeters(geometry[index - 1]!, geometry[index]!)
      if (next > end) {
        last = index - 1
        break
      }
      travelled = next
    }
  }
  return { first, last }
}

export function createPublishPrivacyPreview(input: {
  geometry: Coordinate[]
  instructions?: RouteInstruction[]
  distanceMiles: number
  durationMinutes: number
  zones?: PrivacyZone[]
  trimStartMeters?: number
  trimEndMeters?: number
}): PublishPrivacyPreview {
  if (input.geometry.length < 2) throw new Error("A publish preview needs a route geometry")
  const zones = input.zones ?? []
  const trimmed = trimGeometry(input.geometry, input.trimStartMeters ?? 0, input.trimEndMeters ?? 0)
  const { segments, privateIndexes } = splitPrivatePoints(trimmed, zones)
  const publicMeters = segments.reduce((sum, segment) => sum + lineLength(segment), 0)
  const originalMeters = lineLength(input.geometry)
  const ratio = originalMeters > 0 ? Math.max(0, Math.min(1, publicMeters / originalMeters)) : 0
  const originalMask = splitPrivatePoints(input.geometry, zones)
  const instructionIndexes = trimInstructionIndexes(input.geometry, input.trimStartMeters ?? 0, input.trimEndMeters ?? 0)
  const publicInstructions = (input.instructions ?? []).filter((instruction) => {
    const [start, end] = instruction.interval
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < instructionIndexes.first || end > instructionIndexes.last) return false
    for (let index = start; index <= end; index += 1) if (originalMask.privateIndexes.has(index)) return false
    for (let index = start; index < end; index += 1) if (originalMask.privateEdges.has(index)) return false
    return true
  })
  return {
    publicGeometry: segments,
    publicInstructions,
    publicDistanceMiles: input.distanceMiles * ratio,
    publicDurationMinutes: input.durationMinutes * ratio,
    redactedPointCount: input.geometry.length - trimmed.length + privateIndexes.size,
    redactedInstructionCount: (input.instructions?.length ?? 0) - publicInstructions.length,
    exactPreviewRequired: true
  }
}
