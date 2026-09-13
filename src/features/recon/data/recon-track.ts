import {
  polylineDistanceMeters,
  sumElevationChanges,
} from "@/lib/client/geo-math";
import type { Coordinate } from "@/lib/routing/types";
import type {
  ReconPlaybackKind,
  ReconTrack,
  ReconTrackFacts,
  ReconTrackKind,
  ReconTrackPoint,
} from "@/features/recon/types";

/**
 * Shared, pure toolkit for Recon source adapters. Everything here treats
 * source objects as read-only, fails closed on invalid geometry, and keeps
 * unknown values unknown.
 */

export function isValidReconCoordinate(coordinate: Coordinate): boolean {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return false;
  const [lng, lat] = coordinate as [number, number];
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Non-finite readings become unknown (null), never a substituted zero. */
export function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** ISO timestamps parse to epoch milliseconds; unparseable input is null. */
export function parseTimestampMs(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export type TimestampClassification = "recorded" | "preview" | "invalid";

/**
 * Timestamps are classified, never repaired. Every point timestamped means
 * the track can play back on observed time; none means it is a preview; a
 * mix is invalid because the gap cannot be interpolated truthfully.
 */
export function classifyTimestamps(
  ms: ReadonlyArray<number | null>,
): TimestampClassification {
  const present = ms.filter((value) => value !== null);
  if (present.length === 0) return "preview";
  if (present.length !== ms.length) return "invalid";
  return "recorded";
}

/**
 * Recorded timestamps must be non-decreasing. Equal adjacent stamps are real
 * (the bike was stopped); going backwards is impossible and is rejected by
 * the caller instead of being silently sorted.
 */
export function isMonotonicTimestamps(ms: ReadonlyArray<number>): boolean {
  for (let index = 1; index < ms.length; index += 1) {
    if (ms[index]! < ms[index - 1]!) return false;
  }
  return true;
}

export function cumulativeDistancesMeters(
  points: ReadonlyArray<ReconTrackPoint>,
): number[] {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(
      cumulative[index - 1]! +
        polylineDistanceMeters([
          points[index - 1]!.coordinate,
          points[index]!.coordinate,
        ]),
    );
  }
  return cumulative;
}

/**
 * Ascent/descent from observed altitude readings via the one shared
 * computation (sumElevationChanges, also used by GPX corpus ingest): an
 * unknown reading resets the running previous value, so gaps never
 * contribute invented deltas. With no usable pair of adjacent readings the
 * totals stay unknown rather than becoming a false zero. Readings come off
 * device GPS, so the UI presents these totals as approximate, never as
 * surveyed fact.
 */
export function elevationTotals(points: ReadonlyArray<ReconTrackPoint>): {
  ascentMeters: number | null;
  descentMeters: number | null;
} {
  const totals = sumElevationChanges(
    points.map((point) => point.altitudeMeters),
  );
  if (totals.usablePairCount === 0) {
    return { ascentMeters: null, descentMeters: null };
  }
  return {
    ascentMeters: totals.ascentMeters,
    descentMeters: totals.descentMeters,
  };
}

export interface ReconTrackInit {
  id: string;
  name: string;
  sourceKind: ReconTrackKind;
  playbackKind: ReconPlaybackKind;
  points: ReconTrackPoint[];
  routeId: string | null;
  startedAt: number | null;
  endedAt: number | null;
  facts: ReconTrackFacts;
}

/** Assembles the shared ReconTrack surface from validated points. */
export function createReconTrack(init: ReconTrackInit): ReconTrack {
  return {
    ...init,
    geometry: {
      type: "LineString",
      coordinates: init.points.map(
        (point) => [...point.coordinate] as Coordinate,
      ),
    },
    distanceMeters: polylineDistanceMeters(
      init.points.map((point) => point.coordinate),
    ),
  };
}
