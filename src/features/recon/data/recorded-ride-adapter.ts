import type { RecordedRide } from "@/lib/storage/ride-journal"
import type { ReconTrack, ReconTrackMoment, ReconTrackPoint } from "@/features/recon/types"
import {
  classifyTimestamps,
  createReconTrack,
  elevationTotals,
  finiteOrNull,
  isValidReconCoordinate,
  parseTimestampMs
} from "./recon-track"

/**
 * Adapts a ride-journal entry into a Recon track. Pure: the ride is never
 * mutated. Rides whose every point carries a timestamp stay `recorded`;
 * geometry without timestamps becomes a `preview`. Invalid geometry and
 * impossible timestamp sequences reject the ride instead of being repaired.
 */
export function adaptRecordedRide(ride: RecordedRide): ReconTrack | null {
  if (ride.points.length < 2) return null

  const points: ReconTrackPoint[] = []
  for (const source of ride.points) {
    if (!isValidReconCoordinate(source.coordinate)) return null
    points.push({
      coordinate: [...source.coordinate],
      recordedAt: parseTimestampMs(source.recordedAt),
      speedMph: finiteOrNull(source.speedMph),
      altitudeMeters: finiteOrNull(source.altitudeMeters),
      headingDegrees: finiteOrNull(source.headingDegrees),
      accuracyMeters: finiteOrNull(source.accuracyMeters)
    })
  }

  const classification = classifyTimestamps(points.map((point) => point.recordedAt))
  if (classification === "invalid") return null
  const recorded = classification === "recorded"
  // Without observed time there is no observed speed: a reading that cannot
  // be placed on a timeline stays unknown.
  if (!recorded) for (const point of points) point.speedMph = null

  const startedAt = recorded ? points[0]!.recordedAt : null
  const endedAt = recorded ? points[points.length - 1]!.recordedAt : null

  return createReconTrack({
    id: ride.id,
    name: ride.routeName,
    sourceKind: "recorded-ride",
    playbackKind: recorded ? "recorded" : "preview",
    points,
    routeId: ride.routeId,
    startedAt,
    endedAt,
    plannedGeometry: plannedGeometryOf(ride),
    note: ride.notes.trim() || null,
    moments: recorded ? momentsWithin(ride, startedAt!, endedAt!) : [],
    facts: {
      durationMinutes: recorded ? Math.round((endedAt! - startedAt!) / 60_000) : null,
      ...elevationTotals(points)
    }
  })
}

function plannedGeometryOf(ride: RecordedRide): ReconTrack["plannedGeometry"] {
  const geometry = ride.route?.geometry
  if (!Array.isArray(geometry) || geometry.length < 2) return null
  return geometry.every(isValidReconCoordinate) ? geometry.map((coordinate) => [...coordinate]) : null
}

/** Photo/note captures that fall inside the ride's observed time span. */
function momentsWithin(ride: RecordedRide, startedAt: number, endedAt: number): ReconTrackMoment[] {
  const moments: ReconTrackMoment[] = []
  for (const photo of ride.photos ?? []) {
    const at = parseTimestampMs(photo.takenAt)
    if (at === null || at < startedAt || at > endedAt) continue
    moments.push({ id: photo.id, caption: photo.caption.trim(), at })
  }
  return moments.sort((a, b) => a.at - b.at)
}
