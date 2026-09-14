import type { Coordinate } from "@/lib/routing/types"

/**
 * OpenGravel Recon — presentation-layer data contract.
 *
 * Recon consumes trusted data and presents it. It never edits route
 * geometry, never reinterprets ownership, and never invents facts: every
 * nullable field below is "unknown", never a substituted zero.
 */

/** Where a Recon track came from. */
export type ReconTrackKind = "recorded-ride" | "catalog-route"

/**
 * `recorded` means every point carries a real `recordedAt` and Replay runs on
 * observed time. `preview` means geometry only: distance-normalized progress,
 * no observed speed, no invented elapsed time, never called a replay.
 */
export type ReconPlaybackKind = "recorded" | "preview"

export interface ReconTrackPoint {
  /** `[longitude, latitude]`, the OpenGravel Coordinate convention. */
  coordinate: Coordinate
  /** Epoch milliseconds of the GPS fix; null for geometry without timestamps. */
  recordedAt: number | null
  speedMph: number | null
  altitudeMeters: number | null
  headingDegrees: number | null
  accuracyMeters: number | null
}

/** A timestamped photo/note the rider captured during the ride. */
export interface ReconTrackMoment {
  id: string
  caption: string
  /** Epoch milliseconds, always inside the ride's recorded time span. */
  at: number
}

export interface ReconTrackFacts {
  /** Observed ride duration; null for previews. */
  durationMinutes: number | null
  /** GPS altitude totals — approximate, null when readings are absent. */
  ascentMeters: number | null
  descentMeters: number | null
}

export interface ReconTrack {
  id: string
  name: string
  sourceKind: ReconTrackKind
  playbackKind: ReconPlaybackKind
  /** GeoJSON view of `points`, for map rendering. */
  geometry: { type: "LineString"; coordinates: Coordinate[] }
  points: ReconTrackPoint[]
  distanceMeters: number
  /** Epoch milliseconds; null for previews. */
  startedAt: number | null
  endedAt: number | null
  routeId: string | null
  /** The geometry the rider planned to follow, when the source carries one. */
  plannedGeometry: Coordinate[] | null
  /** Ride-level journal note; never placed on the timeline (it has no time). */
  note: string | null
  moments: ReconTrackMoment[]
  facts: ReconTrackFacts
}

export type ExplorationSegmentStatus = "new-to-you" | "previously-ridden"

/** A contiguous stretch of a ride, by distance along its original points. */
export interface ExplorationSegment {
  fromMeters: number
  toMeters: number
  status: ExplorationSegmentStatus
}

/**
 * One sample of playback. `elapsedMs` starts at zero so GPU layers never see
 * absolute epoch values; `elapsedMs` and `speedMph` are null for previews.
 */
export interface ReplayFrame {
  progress: number
  elapsedMs: number | null
  /** Distance travelled along the original track at this sample. */
  distanceMeters: number
  coordinate: Coordinate
  bearingDegrees: number
  speedMph: number | null
  altitudeMeters: number | null
}
