import type { RideIntent } from "@/lib/domain/ride-intent"
import type { TripPlanRequest } from "@/lib/routing/planner"
import type { RouteProfileId } from "@/lib/routing/types"
import { buildRideTripRequest, createPlanningId } from "./ride-plan-request"

/**
 * One route request is built from one canonical `RideIntent` and nothing else.
 *
 * Every earlier planner defect in this area had the same shape: the request was
 * assembled from React closure variables that were captured before the rider's
 * last edit, so the provider answered a ride the rider had already left behind
 * (BETA-010 toll policy, BETA-011 per-leg styles). Taking the whole intent as
 * one argument makes that class of drift unrepresentable — there is no field a
 * caller can forget to refresh, because there are no separate fields.
 */

/** Per-leg styles always describe exactly the legs the ride currently has. */
export function normalizedSegmentProfiles(
  profiles: readonly RouteProfileId[],
  count: number,
  fallback: RouteProfileId
): RouteProfileId[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => profiles[index] ?? fallback)
}

type RideTopology = Pick<RideIntent, "mode" | "via" | "profile" | "segmentProfiles">

/** Legs in the current topology: one per via, plus the leg to the finish. */
function legCount(intent: RideTopology): number {
  return intent.via.length + 1
}

/**
 * The per-leg styles the deck shows. A loop has no rider-authored legs, so it
 * reports none rather than padding the ride's single style out to a fake
 * topology.
 */
export function activeSegmentProfiles(intent: RideTopology): RouteProfileId[] {
  return intent.mode === "destination"
    ? normalizedSegmentProfiles(intent.segmentProfiles, legCount(intent), intent.profile)
    : []
}

/**
 * Per-leg styles reach the provider only when the rider actually varied them.
 * A ride whose stored styles all match the ride's own style is not a per-leg
 * ride, and sending them would pin the request to a topology the rider may have
 * since replaced.
 */
export function customSegmentProfiles(intent: RideTopology): RouteProfileId[] | undefined {
  if (intent.mode !== "destination") return undefined
  if (!intent.segmentProfiles.some((style) => style !== intent.profile)) return undefined
  return normalizedSegmentProfiles(intent.segmentProfiles, legCount(intent), intent.profile)
}

export interface CanonicalRideRequestOptions {
  seed: number
  /** One id per planning lifecycle, shared by the primary and alternatives calls. */
  planningId?: string
}

/**
 * Throws the same missing-waypoint error `buildRideTripRequest` already raises,
 * so callers keep reporting an unroutable ride rather than sending one.
 */
export function buildCanonicalRideRequest(
  intent: RideIntent,
  { seed, planningId = createPlanningId() }: CanonicalRideRequestOptions
): TripPlanRequest {
  return buildRideTripRequest({
    mode: intent.mode,
    start: intent.start,
    finish: intent.finish,
    profile: intent.profile,
    bikeProfile: intent.bikeProfile,
    roadLocks: intent.roadLocks,
    targetMinutes: intent.targetMinutes,
    timeShaped: intent.timeShaped,
    seed,
    via: intent.via,
    avoidHighways: intent.avoidHighways,
    avoidAreas: intent.avoidAreas,
    segmentProfiles: customSegmentProfiles(intent),
    tollPolicy: intent.tollPolicy,
    planningId,
    ...(intent.sketchCorridor ? { sketchCorridor: intent.sketchCorridor } : {})
  })
}
