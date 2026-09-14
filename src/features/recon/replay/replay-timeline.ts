import { turfBearing } from "@/lib/client/geo-math";
import type { Coordinate } from "@/lib/routing/types";
import type { ReconTrack, ReplayFrame } from "@/features/recon/types";
import {
  cumulativeDistancesMeters,
  isValidReconCoordinate,
} from "@/features/recon/data/recon-track";

/**
 * The replay timeline authority for Recon.
 *
 * Two concerns live here:
 *
 * 1. `sampleReplay` — deterministic playback sampling over a Recon track.
 *    Recorded tracks interpolate on real timestamps: position is normalized
 *    timeline progress, so elapsed time starts at zero and GPU layers never
 *    see absolute epoch values. Preview tracks interpolate on distance-norm
 *    ized progress and never emit observed speed or elapsed time. Impossible
 *    tracks (bad geometry, backwards timestamps, zero duration) fail safely
 *    with null instead of inventing data. Tracks are treated as immutable;
 *    the derived timeline is memoized per track object.
 *
 * 2. Display decimation — the deterministic, vertex-capped geometry used for
 *    GPU replay rendering. Endpoints, point order and major shape changes
 *    are preserved; the stored original is never touched, and X-Ray facts
 *    keep reading the original points.
 */

interface ReplayTimeline {
  points: ReconTrack["points"];
  /** Normalized cumulative times (start at zero); recorded tracks only. */
  timesMs: number[];
  distancesMeters: number[];
  /** Heading per segment, carried through stops; see resolveSegmentBearings. */
  bearingsDegrees: number[];
  totalDurationMs: number | null;
  totalDistanceMeters: number;
}

const timelines = new WeakMap<ReconTrack, ReplayTimeline | null>();

function buildTimeline(track: ReconTrack): ReplayTimeline | null {
  const points = track.points;
  if (points.length < 2) return null;
  for (const point of points) {
    if (!isValidReconCoordinate(point.coordinate)) return null;
  }

  const distancesMeters = cumulativeDistancesMeters(points);
  const totalDistanceMeters = distancesMeters[distancesMeters.length - 1]!;
  const bearingsDegrees = resolveSegmentBearings(points);

  if (track.playbackKind === "preview") {
    return {
      points,
      timesMs: [],
      distancesMeters,
      bearingsDegrees,
      totalDurationMs: null,
      totalDistanceMeters,
    };
  }

  const absoluteTimesMs: number[] = [];
  for (const point of points) {
    if (point.recordedAt === null || !Number.isFinite(point.recordedAt))
      return null;
    absoluteTimesMs.push(point.recordedAt);
  }
  for (let index = 1; index < absoluteTimesMs.length; index += 1) {
    if (absoluteTimesMs[index]! < absoluteTimesMs[index - 1]!) return null;
  }

  const timesMs = absoluteTimesMs.map((time) => time - absoluteTimesMs[0]!);
  const totalDurationMs = timesMs[timesMs.length - 1]!;
  // A zero-duration recorded timeline cannot be sampled truthfully: time
  // says the ride was instant while geometry says it was not.
  if (totalDurationMs <= 0) return null;

  return {
    points,
    timesMs,
    distancesMeters,
    bearingsDegrees,
    totalDurationMs,
    totalDistanceMeters,
  };
}

function timelineFor(track: ReconTrack): ReplayTimeline | null {
  if (!timelines.has(track)) timelines.set(track, buildTimeline(track));
  return timelines.get(track) ?? null;
}

/** Locates the segment containing the target, with a clamped fraction. */
function bracket(
  cumulative: number[],
  target: number,
): { index: number; fraction: number } {
  const lastIndex = cumulative.length - 2;
  for (let index = 0; index <= lastIndex; index += 1) {
    const start = cumulative[index]!;
    const end = cumulative[index + 1]!;
    if (target <= end || index === lastIndex) {
      const span = end - start;
      const fraction = span > 0 ? (target - start) / span : 0;
      return { index, fraction: Math.min(1, Math.max(0, fraction)) };
    }
  }
  return { index: Math.max(0, lastIndex), fraction: 1 };
}

function interpolateCoordinate(
  a: Coordinate,
  b: Coordinate,
  fraction: number,
): Coordinate {
  // Exact endpoints: never re-derive a recorded point through arithmetic.
  if (fraction <= 0) return [...a];
  if (fraction >= 1) return [...b];
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
}

function interpolateScalar(
  a: number | null,
  b: number | null,
  fraction: number,
): number | null {
  if (fraction <= 0) return a;
  if (fraction >= 1) return b;
  if (a === null || b === null) return null;
  return a + (b - a) * fraction;
}

/**
 * Heading of travel per segment, resolved once per timeline.
 *
 * A recorded stop repeats coordinates, and the bearing of identical points
 * reads as north — an invented heading that would snap a camera at every
 * red light. Stops carry the previous valid heading forward instead, and a
 * leading stationary stretch takes the first heading that exists ahead
 * (adjacent geometry, per the camera plan). A track that never moves has no
 * direction information at all and falls back to north, deliberately.
 */
function resolveSegmentBearings(points: ReconTrack["points"]): number[] {
  const raw: (number | null)[] = [];
  let firstValid: number | null = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]!.coordinate;
    const b = points[index + 1]!.coordinate;
    if (a[0] === b[0] && a[1] === b[1]) {
      raw.push(null);
      continue;
    }
    const bearing = turfBearing(a, b);
    const normalized = ((bearing % 360) + 360) % 360;
    const valid = Number.isFinite(normalized) ? normalized : null;
    raw.push(valid);
    if (valid !== null && firstValid === null) firstValid = valid;
  }
  const resolved: number[] = [];
  let carried = firstValid ?? 0;
  for (const value of raw) {
    if (value !== null) carried = value;
    resolved.push(carried);
  }
  return resolved;
}

/**
 * Samples a track at `position` — normalized timeline progress in [0, 1]
 * (elapsed time for recorded rides, distance for previews). Positions out
 * of range clamp to the ride bounds; non-finite positions and unsampleable
 * tracks yield null.
 */
export function sampleReplay(
  track: ReconTrack,
  position: number,
): ReplayFrame | null {
  if (!Number.isFinite(position)) return null;
  const timeline = timelineFor(track);
  if (timeline === null) return null;

  const progress = Math.min(1, Math.max(0, position));

  if (track.playbackKind === "recorded") {
    const target = progress * timeline.totalDurationMs!;
    const { index, fraction } = bracket(timeline.timesMs, target);
    const a = timeline.points[index]!;
    const b = timeline.points[index + 1]!;
    const elapsedMs =
      fraction <= 0
        ? timeline.timesMs[index]!
        : fraction >= 1
          ? timeline.timesMs[index + 1]!
          : timeline.timesMs[index]! +
            (timeline.timesMs[index + 1]! - timeline.timesMs[index]!) *
              fraction;
    return {
      progress,
      elapsedMs,
      coordinate: interpolateCoordinate(a.coordinate, b.coordinate, fraction),
      bearingDegrees: timeline.bearingsDegrees[index]!,
      speedMph: interpolateScalar(a.speedMph, b.speedMph, fraction),
      altitudeMeters: interpolateScalar(
        a.altitudeMeters,
        b.altitudeMeters,
        fraction,
      ),
    };
  }

  const target = progress * timeline.totalDistanceMeters;
  const { index, fraction } = bracket(timeline.distancesMeters, target);
  const a = timeline.points[index]!;
  const b = timeline.points[index + 1]!;
  return {
    progress,
    // Previews carry no observed time and no synthetic speed — ever.
    elapsedMs: null,
    coordinate: interpolateCoordinate(a.coordinate, b.coordinate, fraction),
    bearingDegrees: timeline.bearingsDegrees[index]!,
    speedMph: null,
    altitudeMeters: interpolateScalar(
      a.altitudeMeters,
      b.altitudeMeters,
      fraction,
    ),
  };
}

/** Total normalized duration of a track's timeline; null for previews. */
export function replayDurationMs(track: ReconTrack): number | null {
  const timeline = timelineFor(track);
  if (timeline === null) return null;
  return track.playbackKind === "recorded" ? timeline.totalDurationMs : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Display decimation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rendered replay vertices stay in the 2000–4000 band per the performance
 * contract: below raw-GPS density, above the threshold where trail updates
 * become visible steps.
 */
export const RECON_MAX_RENDER_VERTICES = 3000;

/**
 * The decimated, render-only view of a track. `originalIndices` maps every
 * displayed vertex back to its source point so display geometry can carry
 * per-vertex truth (timestamps, exploration status) without duplicating it.
 */
export interface ReconDisplayGeometry {
  coordinates: Coordinate[];
  originalIndices: number[];
  /** Cumulative distance (meters) along the decimated polyline. */
  cumulativeDistancesMeters: number[];
  /**
   * Normalized elapsed time (ms since ride start) at each decimated vertex,
   * taken from the original recorded timestamps; recorded tracks only.
   */
  cumulativeTimesMs: number[] | null;
  totalDistanceMeters: number;
  totalDurationMs: number | null;
}

const displayGeometries = new WeakMap<
  ReconTrack,
  Map<number, ReconDisplayGeometry | null>
>();

/** Meters-per-degree conversion used for the planar simplification metric. */
const METERS_PER_DEGREE = 111_320;

/** Planar perpendicular distance of p from segment a→b, in meters. */
function perpendicularDistanceMeters(
  p: Coordinate,
  a: Coordinate,
  b: Coordinate,
): number {
  const midLatRad = (((a[1] + b[1]) / 2) * Math.PI) / 180;
  const lngScale = METERS_PER_DEGREE * Math.max(0.05, Math.cos(midLatRad));
  const px = p[0] * lngScale;
  const py = p[1] * METERS_PER_DEGREE;
  const ax = a[0] * lngScale;
  const ay = a[1] * METERS_PER_DEGREE;
  const bx = b[0] * lngScale;
  const by = b[1] * METERS_PER_DEGREE;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * (px - ax) - dx * (py - ay)) / length;
}

/**
 * Douglas–Peucker by vertex budget: run the classic error assignment (each
 * interior vertex receives the perpendicular error it would introduce), then
 * keep the endpoints plus the largest-error vertices up to the cap. Ties
 * break toward the lower index, so the result is fully deterministic.
 */
function selectVerticesByBudget(
  coordinates: readonly Coordinate[],
  maxVertices: number,
): number[] {
  const count = coordinates.length;
  if (count <= maxVertices) return coordinates.map((_, index) => index);

  const errors = new Float64Array(count);
  const stack: Array<[number, number]> = [[0, count - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end - start < 2) continue;
    const a = coordinates[start]!;
    const b = coordinates[end]!;
    let bestIndex = -1;
    let bestError = -1;
    for (let index = start + 1; index < end; index += 1) {
      const error = perpendicularDistanceMeters(
        coordinates[index]!,
        a,
        b,
      );
      if (error > bestError) {
        bestError = error;
        bestIndex = index;
      }
    }
    // bestError >= 0 always: the range has at least one interior vertex.
    errors[bestIndex] = bestError;
    stack.push([start, bestIndex], [bestIndex, end]);
  }

  const interior: Array<{ index: number; error: number }> = [];
  for (let index = 1; index < count - 1; index += 1) {
    interior.push({ index, error: errors[index]! });
  }
  interior.sort(
    (a, b) => b.error - a.error || a.index - b.index,
  );
  const selected = interior
    .slice(0, Math.max(0, maxVertices - 2))
    .map((entry) => entry.index);
  selected.push(0, count - 1);
  selected.sort((a, b) => a - b);
  return selected;
}

/**
 * Deterministic display decimation of a track for GPU rendering. Fails
 * closed (null) on the same impossible inputs `sampleReplay` rejects.
 * Memoized per track object and cap; the stored original is never touched.
 */
export function decimateTrackForDisplay(
  track: ReconTrack,
  maxVertices: number = RECON_MAX_RENDER_VERTICES,
): ReconDisplayGeometry | null {
  if (!Number.isInteger(maxVertices) || maxVertices < 2) return null;
  let byCap = displayGeometries.get(track);
  if (byCap === undefined) {
    byCap = new Map();
    displayGeometries.set(track, byCap);
  }
  if (byCap.has(maxVertices)) return byCap.get(maxVertices)!;

  const geometry = buildDisplayGeometry(track, maxVertices);
  byCap.set(maxVertices, geometry);
  return geometry;
}

function buildDisplayGeometry(
  track: ReconTrack,
  maxVertices: number,
): ReconDisplayGeometry | null {
  const timeline = timelineFor(track);
  if (timeline === null) return null;

  const coordinates = track.points.map((point) => point.coordinate);
  const originalIndices = selectVerticesByBudget(coordinates, maxVertices);

  const displayCoordinates = originalIndices.map((index) => [
    ...coordinates[index]!,
  ] as Coordinate);
  const displayPoints = originalIndices.map((index) => track.points[index]!);
  const displayCumulativeDistances =
    cumulativeDistancesMeters(displayPoints);

  let cumulativeTimesMs: number[] | null = null;
  let totalDurationMs: number | null = null;
  if (track.playbackKind === "recorded" && timeline.totalDurationMs !== null) {
    cumulativeTimesMs = displayPoints.map(
      (point) => (point.recordedAt ?? 0) - (track.points[0]!.recordedAt ?? 0),
    );
    totalDurationMs = timeline.totalDurationMs;
  }

  return {
    coordinates: displayCoordinates,
    originalIndices,
    cumulativeDistancesMeters: displayCumulativeDistances,
    cumulativeTimesMs,
    totalDistanceMeters:
      displayCumulativeDistances[displayCumulativeDistances.length - 1]!,
    totalDurationMs,
  };
}

/**
 * Index of the decimated vertex at or immediately before the playback head.
 * Recorded tracks cut on elapsed time; previews cut on distance. Out-of-
 * domain positions clamp; non-finite positions read as the ride start.
 */
export function displayCutIndex(
  geometry: ReconDisplayGeometry,
  position: number,
): number {
  const lastIndex = geometry.coordinates.length - 1;
  if (lastIndex <= 0) return 0;
  const progress = Number.isFinite(position)
    ? Math.min(1, Math.max(0, position))
    : 0;
  const axis =
    geometry.cumulativeTimesMs ?? geometry.cumulativeDistancesMeters;
  const target = progress * axis[lastIndex]!;
  const epsilon = 1e-6;
  let low = 0;
  let high = lastIndex;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (axis[mid]! <= target + epsilon) low = mid;
    else high = mid - 1;
  }
  return low;
}
