import { polylineDistanceMeters, sumElevationChanges } from "@/lib/client/geo-math"
import type { Coordinate } from "@/lib/routing/types"
import type { ReconTrack, ReconTrackPoint } from "@/features/recon/types"

/**
 * Shared, pure toolkit for Recon source adapters. Source objects are
 * read-only, invalid geometry fails closed, unknown values stay unknown.
 */

export function isValidReconCoordinate(coordinate: Coordinate): boolean {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return false
  const [lng, lat] = coordinate
  return Number.isFinite(lng) && Number.isFinite(lat) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/** Non-finite readings become unknown (null), never a substituted zero. */
export function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export type TimestampClassification = "recorded" | "preview" | "invalid"

/**
 * Timestamps are classified, never repaired: all present and non-decreasing
 * is recorded, none is a preview, and a mix or a backwards step is invalid
 * because the gap cannot be interpolated truthfully.
 */
export function classifyTimestamps(ms: ReadonlyArray<number | null>): TimestampClassification {
  let present = 0
  let previous = -Infinity
  for (const value of ms) {
    if (value === null) continue
    if (value < previous) return "invalid"
    previous = value
    present += 1
  }
  if (present === 0) return "preview"
  return present === ms.length ? "recorded" : "invalid"
}

export function cumulativeDistancesMeters(coordinates: ReadonlyArray<Coordinate>): number[] {
  const cumulative = [0]
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulative.push(cumulative[index - 1]! + polylineDistanceMeters([coordinates[index - 1]!, coordinates[index]!]))
  }
  return cumulative
}

/**
 * Ascent/descent through the shared elevation helper. With no usable pair of
 * readings the totals stay unknown rather than becoming a false zero.
 */
export function elevationTotals(points: ReadonlyArray<ReconTrackPoint>): {
  ascentMeters: number | null
  descentMeters: number | null
} {
  const totals = sumElevationChanges(points.map((point) => point.altitudeMeters))
  if (totals.usablePairCount === 0) return { ascentMeters: null, descentMeters: null }
  return { ascentMeters: totals.ascentMeters, descentMeters: totals.descentMeters }
}

export type ReconTrackInit = Omit<ReconTrack, "geometry" | "distanceMeters">

export function createReconTrack(init: ReconTrackInit): ReconTrack {
  const coordinates = init.points.map((point) => [...point.coordinate] as Coordinate)
  return {
    ...init,
    geometry: { type: "LineString", coordinates },
    distanceMeters: polylineDistanceMeters(coordinates)
  }
}
