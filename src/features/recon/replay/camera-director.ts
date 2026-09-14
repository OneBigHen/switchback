import { turfBearing } from "@/lib/client/geo-math"
import type { Coordinate } from "@/lib/routing/types"
import { normalizeDegrees, pointAtFraction, type DisplayPath } from "./replay-timeline"

/**
 * The replay camera director: a small deterministic state machine that owns
 * high-frequency camera state outside React. The engine feeds it the rider's
 * position every frame and applies the returned pose with one `jumpTo`.
 *
 * Design rules:
 * - The rider is never lagged off-screen: the center follows the path point
 *   exactly; only mode changes blend, over a fixed eased window.
 * - Heading comes from a chord of the path around the rider (behind → ahead),
 *   never from a single GPS segment, so jitter cannot churn the bearing, and
 *   bearing eases along the shortest arc so crossing north never spins.
 * - Look-ahead distances are in meters and grow with on-screen ground speed,
 *   so fast playback pulls the camera back instead of blurring the road.
 */

export type ReconCameraMode = "overview" | "chase" | "lead" | "orbit" | "free"

export const RECON_CAMERA_MODES: ReadonlyArray<{ id: ReconCameraMode; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "chase", label: "Chase" },
  { id: "lead", label: "Lead" },
  { id: "orbit", label: "Orbit" },
  { id: "free", label: "Free" }
]

export interface CameraPose {
  center: Coordinate
  bearing: number
  pitch: number
  zoom: number
}

export interface DirectorInput {
  path: DisplayPath
  /** Rider position as a fraction of path length. */
  fraction: number
  /** Ground meters covered per wall-clock second at the current rate. */
  groundSpeedMps: number
  playing: boolean
  /** Wall-clock ms since the previous frame. */
  dtMs: number
}

const MODE_BLEND_MS = 1100
const BEARING_TAU_MS = 650
const ZOOM_TAU_MS = 500
const ORBIT_DEGREES_PER_SECOND = 7

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function shortestArc(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export function blendPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  return {
    center: [lerp(a.center[0], b.center[0], t), lerp(a.center[1], b.center[1], t)],
    bearing: normalizeDegrees(a.bearing + shortestArc(a.bearing, b.bearing) * t),
    pitch: lerp(a.pitch, b.pitch, t),
    zoom: lerp(a.zoom, b.zoom, t)
  }
}

/** Point `meters` ahead of (or behind, when negative) the rider on the path. */
export function pointOffset(path: DisplayPath, fraction: number, meters: number): Coordinate {
  const total = Math.max(1, path.totalDistanceMeters)
  return pointAtFraction(path, fraction + meters / total).coordinate
}

/** Heading from a chord around the rider; stable against GPS jitter. */
export function chordBearing(path: DisplayPath, fraction: number, behindMeters: number, aheadMeters: number): number | null {
  const from = pointOffset(path, fraction, -behindMeters)
  const to = pointOffset(path, fraction, aheadMeters)
  if (from[0] === to[0] && from[1] === to[1]) return null
  const bearing = normalizeDegrees(turfBearing(from, to))
  return Number.isFinite(bearing) ? bearing : null
}

/** Zoom at which `meters` of ground spans roughly `viewportPx` (512 px world tiles). */
export function zoomForSpan(meters: number, latitude: number, viewportPx: number): number {
  const metersPerPixelAtZ0 = 78_271.52 * Math.cos((latitude * Math.PI) / 180)
  return clamp(Math.log2((metersPerPixelAtZ0 * viewportPx) / Math.max(50, meters)), 3, 17.5)
}

/** Ride-level framing target for one mode, before smoothing. */
export function modeTarget(
  mode: Exclude<ReconCameraMode, "free">,
  input: Pick<DirectorInput, "path" | "fraction" | "groundSpeedMps">,
  viewportPx: number,
  orbitDegrees: number,
  fallbackBearing: number
): CameraPose {
  const { path, fraction } = input
  const rider = pointAtFraction(path, fraction).coordinate
  // Seconds of road the camera should keep readable ahead of the rider.
  const speed = Math.max(8, input.groundSpeedMps)
  switch (mode) {
    case "overview": {
      const span = clamp(path.totalDistanceMeters * 0.35, 2_500, 40_000)
      const ahead = pointOffset(path, fraction, span * 0.35)
      return {
        center: [lerp(rider[0], ahead[0], 0.45), lerp(rider[1], ahead[1], 0.45)],
        bearing: chordBearing(path, fraction, span * 0.1, span * 0.4) ?? fallbackBearing,
        pitch: 48,
        zoom: zoomForSpan(span, rider[1], viewportPx)
      }
    }
    case "chase": {
      const lookahead = clamp(speed * 4, 160, 2_500)
      const ahead = pointOffset(path, fraction, lookahead * 0.45)
      return {
        center: [lerp(rider[0], ahead[0], 0.5), lerp(rider[1], ahead[1], 0.5)],
        bearing: chordBearing(path, fraction, lookahead * 0.25, lookahead) ?? fallbackBearing,
        pitch: 64,
        zoom: zoomForSpan(lookahead * 2.4, rider[1], viewportPx)
      }
    }
    case "lead": {
      const lookahead = clamp(speed * 3, 140, 2_000)
      const ahead = pointOffset(path, fraction, lookahead * 0.6)
      const travel = chordBearing(path, fraction, lookahead * 0.3, lookahead) ?? fallbackBearing
      return {
        center: [lerp(rider[0], ahead[0], 0.5), lerp(rider[1], ahead[1], 0.5)],
        bearing: normalizeDegrees(travel + 180),
        pitch: 58,
        zoom: zoomForSpan(lookahead * 2.2, rider[1], viewportPx)
      }
    }
    case "orbit": {
      const travel = chordBearing(path, fraction, 150, 300) ?? fallbackBearing
      return {
        center: rider,
        bearing: normalizeDegrees(travel + 35 + orbitDegrees),
        pitch: 62,
        zoom: zoomForSpan(clamp(speed * 5, 600, 3_000), rider[1], viewportPx)
      }
    }
  }
}

export class ReconCameraDirector {
  private modeValue: ReconCameraMode
  private following = true
  private pose: CameraPose | null = null
  private blendFrom: CameraPose | null = null
  private blendElapsedMs = 0
  private smoothedBearing: number | null = null
  private smoothedZoom: number | null = null
  private orbitDegrees = 0

  constructor(
    mode: ReconCameraMode,
    private reducedMotion: boolean,
    private viewportPx = 800
  ) {
    this.modeValue = mode
  }

  get mode(): ReconCameraMode {
    return this.modeValue
  }

  get isFollowing(): boolean {
    return this.following && this.modeValue !== "free"
  }

  setViewport(viewportPx: number): void {
    this.viewportPx = Math.max(200, viewportPx)
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion
  }

  setMode(mode: ReconCameraMode): void {
    if (mode === this.modeValue && this.following) return
    this.modeValue = mode
    this.following = true
    this.startBlend()
  }

  /** The rider took the camera; the director stops until Resume Follow. */
  suspend(): void {
    this.following = false
  }

  resume(currentPose?: CameraPose): void {
    if (currentPose) this.pose = currentPose
    this.following = true
    this.startBlend()
  }

  /** A scrub jumped the rider: blend briefly rather than cut. */
  jumped(): void {
    this.startBlend()
  }

  private startBlend(): void {
    this.blendFrom = this.pose
    this.blendElapsedMs = 0
    this.smoothedBearing = null
    this.smoothedZoom = null
  }

  /** Next pose to apply, or null when the rider owns the camera. */
  update(input: DirectorInput): CameraPose | null {
    if (!this.isFollowing) return null
    const mode = this.modeValue as Exclude<ReconCameraMode, "free">
    const dt = clamp(Number.isFinite(input.dtMs) ? input.dtMs : 0, 0, 250)

    // Orbit rotates only while paused, and never under reduced motion.
    if (mode === "orbit" && !input.playing && !this.reducedMotion) {
      this.orbitDegrees = (this.orbitDegrees + (ORBIT_DEGREES_PER_SECOND * dt) / 1000) % 360
    }

    const target = modeTarget(mode, input, this.viewportPx, this.orbitDegrees, this.pose?.bearing ?? 0)
    if (this.reducedMotion) {
      this.pose = target
      this.blendFrom = null
      return target
    }

    const bearingAlpha = 1 - Math.exp(-dt / BEARING_TAU_MS)
    const zoomAlpha = 1 - Math.exp(-dt / ZOOM_TAU_MS)
    this.smoothedBearing =
      this.smoothedBearing === null
        ? target.bearing
        : normalizeDegrees(this.smoothedBearing + shortestArc(this.smoothedBearing, target.bearing) * bearingAlpha)
    this.smoothedZoom = this.smoothedZoom === null ? target.zoom : lerp(this.smoothedZoom, target.zoom, zoomAlpha)
    let next: CameraPose = { ...target, bearing: this.smoothedBearing, zoom: this.smoothedZoom }

    if (this.blendFrom) {
      this.blendElapsedMs += dt
      const t = clamp(this.blendElapsedMs / MODE_BLEND_MS, 0, 1)
      next = blendPose(this.blendFrom, next, easeInOut(t))
      if (t >= 1) this.blendFrom = null
    }
    this.pose = next
    return next
  }
}
