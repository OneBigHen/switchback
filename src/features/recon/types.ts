import type { Coordinate } from "@/lib/routing/types"

/**
 * OpenGravel Recon — presentation-layer data contract.
 *
 * Recon consumes trusted data and presents it. It never edits route
 * geometry, never reinterprets ownership, and never invents facts: every
 * nullable field below is "unknown", never a substituted zero.
 */

/** Where a Recon track came from. */
export type ReconTrackKind = "recorded-ride" | "saved-route" | "catalog-route"

/**
 * How the track plays back. `recorded` means real ride-journal points with
 * real `recordedAt` timestamps exist and Replay interpolates on observed
 * time. `preview` means geometry only: distance-normalized progress, no
 * observed speed, no invented elapsed time, never presented as a replay.
 */
export type ReconPlaybackKind = "recorded" | "preview"

export interface ReconTrackPoint {
  /** `[longitude, latitude]`, matching the OpenGravel Coordinate convention. */
  coordinate: Coordinate
  /** Epoch milliseconds of the GPS fix; null for geometry without timestamps. */
  recordedAt: number | null
  speedMph: number | null
  altitudeMeters: number | null
  headingDegrees: number | null
  accuracyMeters: number | null
}

/**
 * Rider-facing facts derived from the source object itself. A null is an
 * honest "not observed / not evaluated"; surface and match evidence arrive
 * only from existing OpenGravel intelligence, never from inference.
 */
export interface ReconTrackFacts {
  /** Observed ride duration; null for previews (no invented elapsed time). */
  durationMinutes: number | null
  ascentMeters: number | null
  descentMeters: number | null
  /** True only when existing surface evidence actually covers this track. */
  surfaceKnown: boolean
  matchPercent: number | null
  confidence: "high" | "medium" | "low" | null
}

export interface ReconTrack {
  id: string
  name: string
  sourceKind: ReconTrackKind
  playbackKind: ReconPlaybackKind
  /**
   * GeoJSON view of the track for map rendering, derived from `points`.
   * Rendering decimation (applied later, per phase) lives in the renderer,
   * never here: the stored/observed geometry stays untouched.
   */
  geometry: { type: "LineString"; coordinates: Coordinate[] }
  points: ReconTrackPoint[]
  distanceMeters: number
  /** Epoch milliseconds; null for previews. */
  startedAt: number | null
  endedAt: number | null
  /** The route this track's geometry or ride belongs to, when one exists. */
  routeId: string | null
  facts: ReconTrackFacts
}

/** How a stretch of a recorded ride compares against ride history. */
export type ExplorationSegmentStatus = "new-to-you" | "previously-ridden"

export interface ExplorationSegment {
  /** Inclusive start index into the track's points. */
  fromIndex: number
  /** Inclusive end index into the track's points. */
  toIndex: number
  distanceMeters: number
  status: ExplorationSegmentStatus
}

/**
 * One sample of playback. `elapsedMs` is normalized to start at zero so GPU
 * layers never see absolute epoch values; `speedMph`/`elapsedMs` are null
 * for previews, and unknown readings stay null everywhere.
 */
export interface ReplayFrame {
  progress: number
  elapsedMs: number | null
  coordinate: Coordinate
  bearingDegrees: number
  speedMph: number | null
  altitudeMeters: number | null
}
