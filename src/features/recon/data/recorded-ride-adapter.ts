import type { RecordedRide } from "@/lib/storage/ride-journal";
import type { ReconTrack, ReconTrackPoint } from "@/features/recon/types";
import {
  classifyTimestamps,
  createReconTrack,
  elevationTotals,
  finiteOrNull,
  isMonotonicTimestamps,
  isValidReconCoordinate,
  parseTimestampMs,
} from "./recon-track";

/**
 * Adapts a ride-journal entry into a Recon track.
 *
 * Pure: the ride is treated as read-only and never mutated. Rides with real
 * `recordedAt` timestamps keep `playbackKind: "recorded"`; geometry without
 * usable timestamps becomes a `"preview"`. Invalid geometry and impossible
 * timestamp sequences reject the ride (null) instead of being repaired.
 */
export function adaptRecordedRide(ride: RecordedRide): ReconTrack | null {
  if (ride.points.length < 2) return null;

  const points: ReconTrackPoint[] = [];
  for (const source of ride.points) {
    if (!isValidReconCoordinate(source.coordinate)) return null;
    points.push({
      coordinate: [...source.coordinate],
      recordedAt: parseTimestampMs(source.recordedAt),
      speedMph: finiteOrNull(source.speedMph),
      altitudeMeters: finiteOrNull(source.altitudeMeters),
      headingDegrees: finiteOrNull(source.headingDegrees),
      accuracyMeters: finiteOrNull(source.accuracyMeters),
    });
  }

  const classification = classifyTimestamps(
    points.map((point) => point.recordedAt),
  );
  if (classification === "invalid") return null;

  const playbackKind = classification === "recorded" ? "recorded" : "preview";
  if (playbackKind === "recorded") {
    const times = points.map((point) => point.recordedAt!);
    if (!isMonotonicTimestamps(times)) return null;
  }

  const startedAt = playbackKind === "recorded" ? points[0]!.recordedAt : null;
  const endedAt =
    playbackKind === "recorded" ? points[points.length - 1]!.recordedAt : null;
  const elevation = elevationTotals(points);

  return createReconTrack({
    id: ride.id,
    name: ride.routeName,
    sourceKind: "recorded-ride",
    playbackKind,
    points,
    routeId: ride.routeId,
    startedAt,
    endedAt,
    facts: {
      durationMinutes:
        playbackKind === "recorded"
          ? Math.round((endedAt! - startedAt!) / 60_000)
          : null,
      ascentMeters: elevation.ascentMeters,
      descentMeters: elevation.descentMeters,
      // Phase 0 evaluates no surface or map-match evidence. Unknown stays
      // unknown until the existing Gravel Atlas / intelligence integration
      // actually intersects this track — never inferred from names or looks.
      surfaceKnown: false,
      matchPercent: null,
      confidence: null,
    },
  });
}
