import { turfDistance } from "@/lib/client/geo-math";
import type { Coordinate } from "@/lib/routing/types";

/**
 * The deterministic replay camera director.
 *
 * A small, pure state machine owns high-frequency camera state OUTSIDE
 * React: `update()` maps (mode, replay sample, display path, dt) to the next
 * map pose with deliberate exponential easing, so camera motion is authored,
 * not GPS-snapped. The controller applies the returned pose with `jumpTo`
 * once per frame; camera state never flows through React and `flyTo()` is
 * never called per frame.
 *
 * Determinism contract: the same director, given the same sequence of
 * inputs, produces the same sequence of poses. Bearing moves along the
 * shortest arc, so a ride crossing north never spins 359°→0°. Manual
 * interaction suspends the director until an explicit Resume Follow; Free
 * mode hands the camera to the rider permanently.
 */

export type ReconCameraMode = "overview" | "chase" | "lead" | "orbit" | "free";

export interface ReconDirectorPose {
  center: Coordinate;
  /** Compass direction the camera faces, normalized to [0, 360). */
  bearingDegrees: number;
  pitch: number;
  zoom: number;
}

export interface ReconDirectorEnvironment {
  /** Viewport in CSS pixels. */
  viewport: { width: number; height: number };
  /** prefers-reduced-motion: snap instead of easing, no orbit rotation. */
  reducedMotion: boolean;
  /** Phone-class viewport: Overview is the default mode (mobile contract). */
  compactViewport: boolean;
}

export interface ReconDirectorSample {
  /** Current replay position on the ground. */
  coordinate: Coordinate;
  /**
   * Direction of travel, derived from adjacent geometry with recorded stops
   * carried through (see replay-timeline). Recorded headingDegrees is often
   * absent or noisy, so the adjacent-geometry bearing is the trusted source.
   */
  bearingDegrees: number;
  /** True while playback is paused; Orbit may rotate only when paused. */
  paused: boolean;
}

export interface ReconDirectorPath {
  /** Display (decimated) coordinates, in ride order. */
  coordinates: readonly Coordinate[];
  /** Cumulative distance (meters) per vertex, first = 0. */
  cumulativeDistancesMeters: readonly number[];
  /** Normalized playback progress in [0, 1]. */
  position: number;
}

/** Overview leads the rider by this fraction of the ride. */
const OVERVIEW_LOOKAHEAD_FRACTION = 0.18;
/** Chase looks a short way down the road, not over the horizon. */
const CHASE_LOOKAHEAD_FRACTION = 0.05;
/** Lead rides further ahead, looking back. */
const LEAD_LOOKAHEAD_FRACTION = 0.12;

/** How strongly each mode anchors on the rider vs the lookahead point. */
const CHASE_RIDER_ANCHOR = 0.25;
const LEAD_RIDER_ANCHOR = 0.25;
const OVERVIEW_RIDER_ANCHOR = 0.5;

/** Easing time constants (ms) per mode: deliberate, never twitchy. */
const TAU_MS: Record<Exclude<ReconCameraMode, "free">, number> = {
  overview: 550,
  chase: 320,
  lead: 320,
  orbit: 750,
};

/** Cinematic pitch band per mode (maxPitch 75, per the map factory). */
const PITCH_DEGREES: Record<Exclude<ReconCameraMode, "free">, number> = {
  overview: 50,
  chase: 60,
  lead: 60,
  orbit: 62,
};

const REDUCED_MOTION_PITCH = 35;

/** Close-in zooms for the ride-level modes. */
const CHASE_ZOOM = 15.2;
const LEAD_ZOOM = 14.6;
const ORBIT_ZOOM = 15.2;

/** Orbit rotation speed while paused; disabled under reduced motion. */
const ORBIT_RATE_DEGREES_PER_SECOND = 4;

const MAX_PITCH = 75;
const MIN_ZOOM = 3;
const MAX_ZOOM = 18;

/**
 * Overview zoom from ride length: a deliberate framing heuristic — longer
 * rides pull further back, short rides stay intimate. Deterministic.
 */
function overviewZoomFor(
  totalDistanceMeters: number,
  viewport: { width: number },
): number {
  const rideFactor = Math.max(1, totalDistanceMeters / 2000);
  const zoom = 12.8 - Math.log2(rideFactor);
  const compactBias = viewport.width < 640 ? -0.4 : 0;
  return Math.min(13.2, Math.max(8.5, zoom + compactBias));
}

/**
 * The mode a fresh replay starts in: Overview on phone-class viewports per
 * the mobile contract, Chase on desktop.
 */
export function defaultCameraMode(
  environment: ReconDirectorEnvironment,
): ReconCameraMode {
  return environment.compactViewport ? "overview" : "chase";
}

/** Shortest signed arc from a to b, in (-180, 180]. */
function angularDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpCoordinate(a: Coordinate, b: Coordinate, t: number): Coordinate {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

/**
 * Coordinate at a normalized position along the display path, interpolated
 * between the bracketing vertices. Returns null for empty paths.
 */
function pointAtFraction(
  path: ReconDirectorPath,
  fraction: number,
): Coordinate | null {
  const cumulative = path.cumulativeDistancesMeters;
  if (cumulative.length === 0) return null;
  const total = cumulative[cumulative.length - 1]!;
  if (total <= 0) return path.coordinates[0] ?? null;
  const target = clamp(fraction, 0, 1) * total;
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (cumulative[mid]! <= target) low = mid;
    else high = mid - 1;
  }
  const startIndex = Math.min(low, cumulative.length - 2);
  const start = cumulative[startIndex]!;
  const end = cumulative[startIndex + 1]!;
  const span = end - start;
  const t = span > 0 ? clamp((target - start) / span, 0, 1) : 0;
  const a = path.coordinates[startIndex]!;
  const b = path.coordinates[startIndex + 1] ?? a;
  return lerpCoordinate(a, b, t);
}

interface ModeTarget {
  center: Coordinate;
  bearingDegrees: number;
  pitch: number;
  zoom: number;
}

/**
 * The lookahead coordinate for a mode, or the rider's own position when no
 * display path is available (graceful degradation, never a crash).
 */
function lookaheadCoordinate(
  path: ReconDirectorPath | null,
  position: number,
  fallback: Coordinate,
): Coordinate {
  if (path === null) return fallback;
  return pointAtFraction(path, position) ?? fallback;
}

function overviewTarget(
  sample: ReconDirectorSample,
  path: ReconDirectorPath | null,
  environment: ReconDirectorEnvironment,
  pitch: number,
): ModeTarget {
  const ahead = lookaheadCoordinate(
    path,
    (path?.position ?? 0) + OVERVIEW_LOOKAHEAD_FRACTION,
    sample.coordinate,
  );
  const totalDistanceMeters =
    path?.cumulativeDistancesMeters[path.cumulativeDistancesMeters.length - 1] ??
    10_000;
  return {
    center: lerpCoordinate(sample.coordinate, ahead, OVERVIEW_RIDER_ANCHOR),
    bearingDegrees: sample.bearingDegrees,
    pitch,
    zoom: overviewZoomFor(totalDistanceMeters, environment.viewport),
  };
}

function chaseTarget(
  sample: ReconDirectorSample,
  path: ReconDirectorPath | null,
  pitch: number,
): ModeTarget {
  const ahead = lookaheadCoordinate(
    path,
    (path?.position ?? 0) + CHASE_LOOKAHEAD_FRACTION,
    sample.coordinate,
  );
  return {
    center: lerpCoordinate(sample.coordinate, ahead, CHASE_RIDER_ANCHOR),
    bearingDegrees: sample.bearingDegrees,
    pitch,
    zoom: CHASE_ZOOM,
  };
}

function leadTarget(
  sample: ReconDirectorSample,
  path: ReconDirectorPath | null,
  pitch: number,
): ModeTarget {
  const ahead = lookaheadCoordinate(
    path,
    (path?.position ?? 0) + LEAD_LOOKAHEAD_FRACTION,
    sample.coordinate,
  );
  return {
    center: lerpCoordinate(sample.coordinate, ahead, LEAD_RIDER_ANCHOR),
    bearingDegrees: normalizeDegrees(sample.bearingDegrees + 180),
    pitch,
    zoom: LEAD_ZOOM,
  };
}

function orbitTarget(
  sample: ReconDirectorSample,
  pitch: number,
  orbitAngleDegrees: number,
): ModeTarget {
  return {
    center: sample.coordinate,
    bearingDegrees: normalizeDegrees(
      sample.bearingDegrees + orbitAngleDegrees,
    ),
    pitch,
    zoom: ORBIT_ZOOM,
  };
}

function targetFor(
  mode: Exclude<ReconCameraMode, "free">,
  sample: ReconDirectorSample,
  path: ReconDirectorPath | null,
  environment: ReconDirectorEnvironment,
  orbitAngleDegrees: number,
): ModeTarget {
  const pitch =
    environment.reducedMotion && mode !== "orbit"
      ? REDUCED_MOTION_PITCH
      : PITCH_DEGREES[mode];

  switch (mode) {
    case "overview":
      return overviewTarget(sample, path, environment, pitch);
    case "chase":
      return chaseTarget(sample, path, pitch);
    case "lead":
      return leadTarget(sample, path, pitch);
    case "orbit":
      return orbitTarget(sample, pitch, orbitAngleDegrees);
  }
}

export class ReconCameraDirector {
  private environment: ReconDirectorEnvironment;
  private modeValue: ReconCameraMode;
  private followingValue = true;
  private pose: ReconDirectorPose | null = null;
  private orbitAngleDegrees = 0;

  constructor(environment: ReconDirectorEnvironment) {
    this.environment = { ...environment };
    this.modeValue = defaultCameraMode(environment);
  }

  get mode(): ReconCameraMode {
    return this.modeValue;
  }

  get following(): boolean {
    return this.followingValue;
  }

  setEnvironment(environment: ReconDirectorEnvironment): void {
    this.environment = { ...environment };
  }

  setMode(mode: ReconCameraMode): void {
    if (mode === this.modeValue) return;
    this.modeValue = mode;
    this.orbitAngleDegrees = 0;
  }

  /** The rider took manual control; the director stops directing. */
  suspend(): void {
    this.followingValue = false;
  }

  /** Resume Follow: the director eases back onto the ride. */
  resume(): void {
    this.followingValue = true;
  }

  /**
   * Advances the director by `dtMs` and returns the pose to apply. When the
   * director is suspended or in Free mode, the last directed pose is
   * returned unchanged — the camera belongs to the rider.
   */
  update(
    sample: ReconDirectorSample,
    path: ReconDirectorPath | null,
    dtMs: number,
  ): ReconDirectorPose {
    const dt = Number.isFinite(dtMs) ? clamp(dtMs, 0, 500) : 0;
    if (this.modeValue === "free" || !this.followingValue) {
      if (this.pose === null) {
        this.pose = targetFor("chase", sample, path, this.environment, 0);
      }
      return { ...this.pose };
    }

    const mode = this.modeValue;
    if (
      mode === "orbit" &&
      sample.paused &&
      !this.environment.reducedMotion
    ) {
      this.orbitAngleDegrees =
        (this.orbitAngleDegrees +
          (ORBIT_RATE_DEGREES_PER_SECOND * dt) / 1000) %
        360;
    }

    const target = targetFor(mode, sample, path, this.environment, this.orbitAngleDegrees);
    if (this.pose === null) {
      this.pose = { ...target };
      return { ...this.pose };
    }

    const alpha = this.environment.reducedMotion
      ? 1
      : 1 - Math.exp(-dt / TAU_MS[mode]);
    const current = this.pose;
    const next: ReconDirectorPose = {
      center: lerpCoordinate(current.center, target.center, alpha),
      bearingDegrees: normalizeDegrees(
        current.bearingDegrees +
          angularDelta(current.bearingDegrees, target.bearingDegrees) * alpha,
      ),
      pitch: clamp(lerp(current.pitch, target.pitch, alpha), 0, MAX_PITCH),
      zoom: clamp(lerp(current.zoom, target.zoom, alpha), MIN_ZOOM, MAX_ZOOM),
    };
    this.pose = next;
    return { ...next };
  }
}

/** Exposed for tests and any consumer that needs the shared arc math. */
export { angularDelta as directorAngularDelta };

// Re-exported so the controller can reuse the same distance helper without
// a second geo import surface.
export { turfDistance as directorDistanceMeters };
