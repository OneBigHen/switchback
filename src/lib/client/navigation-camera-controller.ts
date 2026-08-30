import type { Coordinate } from "@/lib/routing/types"
import type { NavigationFrame } from "./navigation-engine"
import { coordinateDistanceMeters } from "./navigation-engine"
import {
  cameraUpdateExceedsDeadband,
  resolveFollowBearing,
  followPitch,
  followZoom,
  lookaheadMeters,
  normalizeBearing,
  routeLookaheadCoordinate,
  routeTangentBearing,
  smoothBearing,
  type CameraDeadband,
  type CameraState,
  type FollowCameraInputs
} from "./navigation-camera-math"

/**
 * The slice of the map the follow camera actually uses. Keeping it structural
 * means the controller can be driven by a fake in tests without a WebGL
 * context, and it documents exactly how much map surface the camera touches.
 */
export interface FollowCameraMap {
  easeTo(options: Record<string, unknown>): unknown
  getBearing(): number
  getPitch(): number
  getZoom(): number
  getCenter(): { lng: number; lat: number }
}

export interface FollowCameraContext {
  /** Padding from the existing tested navigation inset model. */
  padding: { top: number; right: number; bottom: number; left: number }
  /** Selected route geometry, for the route-ahead target and tangent. */
  routeGeometry?: readonly Coordinate[]
  /** Skip animation — used by Recenter so it lands in one controlled move. */
  immediate?: boolean
}

export type FollowState = "following" | "user-pan"

/** Chained eases share this id so an interruption emits no move events. */
export const FOLLOW_EASE_ID = "switchback-follow"

const MIN_EASE_MS = 250
const MAX_EASE_MS = 1200
/** How sharply the camera chases a new bearing. Higher turns faster. */
const HEADING_RESPONSE = 0.45
const FAST_HEADING_RESPONSE = 0.75
/** A turn this large is a real corner, not jitter, so take it promptly. */
const DECISIVE_TURN_DEGREES = 25

/**
 * The imperative half of the ride follow camera.
 *
 * All high-frequency state lives here in instance fields rather than React
 * state: a GPS fix must be able to move the camera without re-rendering the
 * planner. React owns only the coarse transitions (ride mode on/off, and the
 * follow/user-pan flag it renders a button from).
 */
export class NavigationCameraController {
  private smoothedBearing: number | null = null
  private lastApplied: CameraState | null = null
  private lastAppliedCenter: Coordinate | null = null
  private lastFrameAt: number | null = null
  private state: FollowState = "following"

  constructor(private readonly deadband?: CameraDeadband) {}

  followState(): FollowState {
    return this.state
  }

  isFollowing(): boolean {
    return this.state === "following"
  }

  /** The rider touched the map. Following stops until Recenter, with no snap-back. */
  suspend(): void {
    this.state = "user-pan"
  }

  /**
   * Resume following. The smoothing history is dropped so the camera adopts
   * the true heading in one controlled move rather than easing in from
   * wherever the rider left the map pointing.
   */
  resume(): void {
    this.state = "following"
    this.smoothedBearing = null
    this.lastApplied = null
    this.lastAppliedCenter = null
  }

  /** Ride ended or the map was rebuilt; forget everything. */
  reset(): void {
    this.state = "following"
    this.smoothedBearing = null
    this.lastApplied = null
    this.lastAppliedCenter = null
    this.lastFrameAt = null
  }

  private inputsFor(frame: NavigationFrame, geometry?: readonly Coordinate[]): FollowCameraInputs {
    // The engine's own segment bearing is the cheapest trustworthy tangent;
    // sampling the route geometry ahead is smoother where it is available.
    const tangent = geometry
      ? routeTangentBearing(geometry, frame.matchedDistanceMeters)
      : null
    return {
      status: frame.status,
      speedMetersPerSecond: frame.speedMetersPerSecond,
      headingDegrees: frame.headingDegrees,
      accuracyMeters: frame.accuracyMeters,
      routeBearingDegrees: tangent ?? frame.routeBearingDegrees ?? null,
      distanceToManeuverMeters: frame.distanceToInstructionMeters,
      maneuverSign: frame.instruction?.sign ?? null,
      distanceFromRouteMeters: frame.distanceFromRouteMeters,
      matchAmbiguous: frame.matchAmbiguous,
      previousBearingDegrees: this.smoothedBearing
    }
  }

  /**
   * Applies one navigation frame to the camera. Returns whether a camera move
   * was actually issued, which is what the churn tests assert on: every move
   * costs map work, so a frame that changes nothing must cost nothing.
   */
  update(map: FollowCameraMap, frame: NavigationFrame, context: FollowCameraContext): boolean {
    if (!this.isFollowing() && !context.immediate) return false

    const inputs = this.inputsFor(frame, context.routeGeometry)
    const targetBearing = resolveFollowBearing(inputs)
    if (targetBearing !== null) {
      const turn = this.smoothedBearing === null
        ? Infinity
        : Math.abs(normalizeBearing(targetBearing) - normalizeBearing(this.smoothedBearing))
      // A real corner is taken promptly; small changes are damped so the map
      // does not shimmer under GPS noise.
      const response = context.immediate || turn >= DECISIVE_TURN_DEGREES
        ? FAST_HEADING_RESPONSE
        : HEADING_RESPONSE
      this.smoothedBearing = context.immediate
        ? normalizeBearing(targetBearing)
        : smoothBearing(this.smoothedBearing, targetBearing, response)
    }

    const lookahead = lookaheadMeters(inputs)
    const pitch = followPitch(inputs)
    const zoom = followZoom(inputs)
    const center = this.resolveCenter(frame, context, lookahead)
    const bearing = this.smoothedBearing ?? map.getBearing()

    // Compare against the camera state this controller last *commanded*, not
    // against the map's live centre: mid-ease the map is somewhere between
    // the two, so asking the map would report movement on every frame and
    // defeat the deadband entirely.
    const next: CameraState = {
      bearingDegrees: bearing,
      pitchDegrees: pitch,
      zoom,
      centerDistanceMeters: this.lastAppliedCenter
        ? coordinateDistanceMeters(this.lastAppliedCenter, center)
        : Number.POSITIVE_INFINITY
    }
    if (!context.immediate && !cameraUpdateExceedsDeadband(this.lastApplied, next, this.deadband)) {
      return false
    }

    map.easeTo({
      center,
      bearing,
      pitch,
      zoom,
      padding: context.padding,
      duration: context.immediate ? 0 : this.easeDuration(frame),
      // A linear ease reads as steady travel; the default cubic makes every
      // fix look like the bike is breathing.
      easing: (t: number) => t,
      essential: true,
      // Chained follow eases share an id so interrupting one emits no
      // movestart/moveend pair. Those events drive viewport-scoped layer
      // fetches, and a camera that fires them every second starves them.
      easeId: FOLLOW_EASE_ID,
      noMoveStart: true
    })

    this.lastApplied = { ...next, centerDistanceMeters: 0 }
    this.lastAppliedCenter = center
    this.lastFrameAt = frame.timestamp
    return true
  }

  /**
   * Recenter: one controlled move back to the live pose, then following
   * resumes. Deliberately immediate so the rider gets an unambiguous answer
   * to pressing the button.
   */
  recenter(map: FollowCameraMap, frame: NavigationFrame, context: FollowCameraContext): void {
    this.resume()
    this.update(map, frame, { ...context, immediate: true })
  }

  /**
   * Where the camera aims. Looking along the route rather than at the rider
   * is what puts road on screen instead of the ground already ridden; the
   * rider stays low in frame because the inset model biases the padding.
   */
  private resolveCenter(
    frame: NavigationFrame,
    context: FollowCameraContext,
    lookahead: number
  ): Coordinate {
    const trusted = frame.status === "navigating" || frame.status === "deviating"
    if (!trusted || !context.routeGeometry) return frame.rawCoordinate
    const ahead = routeLookaheadCoordinate(
      context.routeGeometry,
      frame.matchedDistanceMeters,
      // Only a quarter of the look-ahead shifts the camera; the rest is
      // expressed as zoom. Keeping this coupling weak is what stops the rider
      // marker wandering up and down the screen as speed changes.
      lookahead * 0.25
    )
    return ahead ?? frame.rawCoordinate
  }

  /**
   * GPS arrives irregularly. Easing over roughly the gap between fixes keeps
   * the camera continuously in motion without ever queueing an animation
   * longer than the next fix.
   */
  private easeDuration(frame: NavigationFrame): number {
    if (this.lastFrameAt === null) return MIN_EASE_MS
    const gap = frame.timestamp - this.lastFrameAt
    if (!Number.isFinite(gap) || gap <= 0) return MIN_EASE_MS
    return Math.max(MIN_EASE_MS, Math.min(MAX_EASE_MS, gap))
  }
}
