import { turfDistance } from "@/lib/client/geo-math";
import type { Coordinate } from "@/lib/routing/types";
import type { ExplorationSegment } from "@/features/recon/types";
import type { ReconTrack } from "@/features/recon/types";
import {
  cumulativeDistancesMeters,
  isValidReconCoordinate,
} from "@/features/recon/data/recon-track";

/**
 * New-to-you intelligence for Replay — track-history comparison, not road
 * discovery.
 *
 * The selected recorded ride is resampled at a fixed interval and compared
 * against the rider's own recorded history through a lightweight spatial
 * bucket index. A sample counts as previously ridden when history exists
 * within a conservative tolerance, direction-independent. Adjacent
 * classifications become contiguous ranges over the track's ORIGINAL point
 * indices, so downstream rendering can colour the trail truthfully.
 *
 * Truth rules: with no recorded history the classifier returns null — no
 * claim is made at all. Copy says "new to you" and never claims newly
 * discovered roads; V1 makes no exploration-denominator claims.
 */

export interface ExplorationOptions {
  /** Comparison resample interval, meters (plan band: 25–50). */
  resampleIntervalMeters?: number;
  /** Max distance for "previously ridden", meters (plan band: 40–60). */
  toleranceMeters?: number;
}

const DEFAULT_RESAMPLE_INTERVAL_METERS = 40;
const DEFAULT_TOLERANCE_METERS = 50;
/** Meters per degree of latitude, spherical approximation. */
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Contiguous previously-ridden / new-to-you runs over the track's points,
 * or null when no recorded history exists to compare against.
 */
interface ClassificationInput {
  trackPoints: ReconTrack["points"];
  cumulative: number[];
  totalDistanceMeters: number;
  grid: BucketGrid;
  intervalMeters: number;
  toleranceMeters: number;
}

/** Validates inputs and prepares the comparison state, or null. */
function prepareClassification(
  track: ReconTrack,
  historyTracks: readonly ReconTrack[],
  options: ExplorationOptions,
): ClassificationInput | null {
  const intervalMeters =
    options.resampleIntervalMeters ?? DEFAULT_RESAMPLE_INTERVAL_METERS;
  const toleranceMeters = options.toleranceMeters ?? DEFAULT_TOLERANCE_METERS;
  if (!(intervalMeters > 0) || !(toleranceMeters > 0)) return null;

  const historySamples = collectHistorySamples(historyTracks);
  if (historySamples.length === 0) return null;

  const trackPoints = track.points;
  if (trackPoints.length < 2) return null;
  for (const point of trackPoints) {
    if (!isValidReconCoordinate(point.coordinate)) return null;
  }
  const cumulative = cumulativeDistancesMeters(trackPoints);
  const totalDistanceMeters = cumulative[cumulative.length - 1]!;
  if (!(totalDistanceMeters > 0)) return null;

  return {
    trackPoints,
    cumulative,
    totalDistanceMeters,
    grid: buildBucketGrid(
      historySamples,
      trackPoints.map((point) => point.coordinate),
      toleranceMeters,
    ),
    intervalMeters,
    toleranceMeters,
  };
}

export function classifyExploration(
  track: ReconTrack,
  historyTracks: readonly ReconTrack[],
  options: ExplorationOptions = {},
): ExplorationSegment[] | null {
  const input = prepareClassification(track, historyTracks, options);
  if (input === null) return null;

  const { trackPoints, cumulative, totalDistanceMeters, grid, intervalMeters, toleranceMeters } =
    input;
  const statuses: ExplorationSegmentStatusInternal[] = [];
  let cursor = 0;
  for (
    let distance = 0;
    distance < totalDistanceMeters;
    distance += intervalMeters
  ) {
    while (
      cursor < cumulative.length - 2 &&
      cumulative[cursor + 1]! <= distance
    ) {
      cursor += 1;
    }
    const start = cumulative[cursor]!;
    const end = cumulative[cursor + 1]!;
    const span = end - start;
    const fraction = span > 0 ? (distance - start) / span : 0;
    const sample = interpolateCoordinate(
      trackPoints[cursor]!.coordinate,
      trackPoints[cursor + 1]!.coordinate,
      fraction,
    );
    statuses.push({
      originalIndex: cursor,
      previouslyRidden: hasHistoryWithinTolerance(
        sample,
        grid,
        toleranceMeters,
      ),
    });
  }
  // The ride tail is covered by the final sample's original index range.
  statuses.push({
    originalIndex: trackPoints.length - 1,
    previouslyRidden: statuses[statuses.length - 1]?.previouslyRidden ?? false,
  });

  return contiguousSegments(statuses, cumulative, trackPoints.length - 1);
}

type ExplorationSegmentStatusInternal = {
  originalIndex: number;
  previouslyRidden: boolean;
};

/**
 * Resampled coordinates from recorded history only. Geometry without
 * timestamps was never ridden, so it can never support a "previously
 * ridden" claim.
 */
function collectHistorySamples(
  historyTracks: readonly ReconTrack[],
): Coordinate[] {
  const samples: Coordinate[] = [];
  for (const history of historyTracks) {
    if (history.playbackKind !== "recorded") continue;
    const points = history.points;
    if (points.length < 2) continue;
    let valid = true;
    for (const point of points) {
      if (!isValidReconCoordinate(point.coordinate)) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;

    const cumulative = cumulativeDistancesMeters(points);
    const total = cumulative[cumulative.length - 1]!;
    let cursor = 0;
    samples.push([...points[0]!.coordinate] as Coordinate);
    if (!(total > 0)) continue;
    for (
      let distance = DEFAULT_RESAMPLE_STEP_METERS;
      distance < total;
      distance += DEFAULT_RESAMPLE_STEP_METERS
    ) {
      while (cursor < cumulative.length - 2 && cumulative[cursor + 1]! <= distance) {
        cursor += 1;
      }
      const start = cumulative[cursor]!;
      const end = cumulative[cursor + 1]!;
      const span = end - start;
      const fraction = span > 0 ? (distance - start) / span : 0;
      samples.push(
        interpolateCoordinate(
          points[cursor]!.coordinate,
          points[cursor + 1]!.coordinate,
          fraction,
        ),
      );
    }
  }
  return samples;
}

/** History resampling walks a fixed step; small enough for bucket indexing. */
const DEFAULT_RESAMPLE_STEP_METERS = 40;

function interpolateCoordinate(
  a: Coordinate,
  b: Coordinate,
  fraction: number,
): Coordinate {
  if (fraction <= 0) return [...a] as Coordinate;
  if (fraction >= 1) return [...b] as Coordinate;
  return [
    a[0] + (b[0] - a[0]) * fraction,
    a[1] + (b[1] - a[1]) * fraction,
  ];
}

interface BucketGrid {
  cellDegLat: number;
  cellDegLng: number;
  cells: Map<string, Coordinate[]>;
}

function bucketKey(grid: BucketGrid, coordinate: Coordinate): string {
  return `${Math.floor(coordinate[0] / grid.cellDegLng)}:${Math.floor(
    coordinate[1] / grid.cellDegLat,
  )}`;
}

/**
 * Spatial bucket index over history samples. Cell extents are derived from
 * the tolerance and the most extreme latitude involved, so a 3×3
 * neighborhood search is always sufficient.
 */
function buildBucketGrid(
  historySamples: readonly Coordinate[],
  trackCoordinates: readonly Coordinate[],
  toleranceMeters: number,
): BucketGrid {
  let maxAbsLat = 0;
  for (const coordinate of historySamples) {
    maxAbsLat = Math.max(maxAbsLat, Math.abs(coordinate[1]));
  }
  for (const coordinate of trackCoordinates) {
    maxAbsLat = Math.max(maxAbsLat, Math.abs(coordinate[1]));
  }
  const cosLat = Math.max(0.05, Math.cos(Math.min(maxAbsLat, 88) * (Math.PI / 180)));
  const cellDegLat = toleranceMeters / METERS_PER_DEGREE_LAT;
  const cellDegLng = toleranceMeters / (METERS_PER_DEGREE_LAT * cosLat);

  const cells = new Map<string, Coordinate[]>();
  const grid: BucketGrid = { cellDegLat, cellDegLng, cells };
  for (const coordinate of historySamples) {
    const key = bucketKey(grid, coordinate);
    const bucket = cells.get(key);
    if (bucket) bucket.push(coordinate);
    else cells.set(key, [coordinate]);
  }
  return grid;
}

function hasHistoryWithinTolerance(
  sample: Coordinate,
  grid: BucketGrid,
  toleranceMeters: number,
): boolean {
  const centerLng = Math.floor(sample[0] / grid.cellDegLng);
  const centerLat = Math.floor(sample[1] / grid.cellDegLat);
  for (let lng = centerLng - 1; lng <= centerLng + 1; lng += 1) {
    for (let lat = centerLat - 1; lat <= centerLat + 1; lat += 1) {
      const bucket = grid.cells.get(`${lng}:${lat}`);
      if (bucket === undefined) continue;
      for (const coordinate of bucket) {
        if (turfDistance(sample, coordinate) <= toleranceMeters) return true;
      }
    }
  }
  return false;
}

/**
 * Collapses the per-sample classification into contiguous ranges over the
 * track's original point indices. Ranges tile the full point range: the
 * first starts at 0, the last ends at the final point, and each range's
 * distance comes from the shared cumulative distances.
 */
function contiguousSegments(
  statuses: readonly ExplorationSegmentStatusInternal[],
  cumulative: readonly number[],
  lastPointIndex: number,
): ExplorationSegment[] {
  const segments: ExplorationSegment[] = [];
  let runStart = 0;
  for (let index = 1; index < statuses.length; index += 1) {
    if (
      statuses[index]!.previouslyRidden !== statuses[runStart]!.previouslyRidden
    ) {
      pushSegment(segments, statuses, runStart, index - 1, cumulative, lastPointIndex);
      runStart = index;
    }
  }
  pushSegment(segments, statuses, runStart, statuses.length - 1, cumulative, lastPointIndex);
  return segments;
}

function pushSegment(
  segments: ExplorationSegment[],
  statuses: readonly ExplorationSegmentStatusInternal[],
  fromStatus: number,
  toStatus: number,
  cumulative: readonly number[],
  lastPointIndex: number,
): void {
  const fromIndex = statuses[fromStatus]!.originalIndex;
  // The final status extends its run to the ride's last point: it exists
  // precisely to cover the tail after the last resample position.
  const toIndex =
    toStatus === statuses.length - 1
      ? lastPointIndex
      : Math.max(fromIndex, statuses[toStatus + 1]!.originalIndex - 1);
  segments.push({
    fromIndex,
    toIndex,
    distanceMeters: Math.max(
      0,
      cumulative[toIndex]! - cumulative[fromIndex]!,
    ),
    status: statuses[fromStatus]!.previouslyRidden
      ? "previously-ridden"
      : "new-to-you",
  });
}
