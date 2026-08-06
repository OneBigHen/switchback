import type {
  FreeRideSuggestion,
  RideEvent,
  RideProfile,
  RouteRequest
} from "@/lib/domain/contracts"
import type { PlannedRoute } from "@/lib/routing/types"
import { scoreRoute, type ScoreableRoute } from "./route-score"
import { calculateGeometryOverlap } from "@/lib/routing/scoring"

export interface FreeRideCandidate {
  id: string
  kind: FreeRideSuggestion["kind"]
  title: string
  actionLabel: string
  origin: [number, number]
  destination: [number, number]
  routeFragment: [number, number][]
  triggerDistanceMeters: number
  addedDurationSeconds: number
  /**
   * Optional direct-route baseline. A curvature-only candidate does not know
   * the rider's final destination, so it must not invent an ETA comparison.
   */
  baselineDurationSeconds?: number
  route: ScoreableRoute
}

/**
 * Fraction (0–1) of the proposed road fragment that the routed geometry
 * actually covers (SB-031): the acceptance route must traverse the suggested
 * road, otherwise the suggestion was not honored.
 */
export function fragmentTraversalRatio(
  routeGeometry: [number, number][],
  fragment: [number, number][]
): number {
  if (fragment.length < 2 || routeGeometry.length < 2) return 0
  return Math.max(0, Math.min(1, calculateGeometryOverlap(routeGeometry, fragment) / 100))
}

export interface FreeRideContext {
  now: string
  profile: RideProfile
  gpsConfidence: number
  workload: "low" | "normal" | "high"
  currentCoordinate: [number, number]
  currentHeadingDegrees: number | null
  rejectedCandidateIds: ReadonlySet<string>
  recentCandidateIds: ReadonlySet<string>
  cooldownUntil?: number
  horizonMeters?: number
}

export interface FreeRideRankingResult {
  suggestion: FreeRideSuggestion | null
  consideredCandidateIds: string[]
  suppressed: boolean
  suppressionReason?: "gps-uncertain" | "high-workload" | "cooldown" | "no-safe-candidate"
}

export interface FreeRideRecommendationState {
  suggestion: FreeRideSuggestion | null
  ignoredCandidateIds: string[]
  acceptedSuggestionId: string | null
  cooldownUntil: number
  lastEvent: RideEvent | null
  privateMode?: boolean
}

export type FreeRideRecommendationAction =
  | { type: "show"; suggestion: FreeRideSuggestion }
  | { type: "ignore"; at: string }
  | { type: "less-like-this"; at: string }
  | { type: "accept"; at: string }
  | { type: "expire"; at: string }
  | { type: "reset" }
  | { type: "clear" }

const MIN_ACTION_DISTANCE_METERS = 400
const DEFAULT_HORIZON_METERS = 16_000
const SUGGESTION_TTL_MS = 45_000
const SUGGESTION_COOLDOWN_MS = 30_000
/** Heading difference beyond which a candidate requires a U-turn (SB-030). */
const MAX_HEADING_DELTA_DEGREES = 100

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
}

/**
 * Initial bearing in degrees (0–360) from `from` toward `to`.
 */
function bearingDegrees(from: [number, number], to: [number, number]): number {
  const toRadians = (value: number) => value * Math.PI / 180
  const toDegrees = (value: number) => value * 180 / Math.PI
  const [fromLon, fromLat] = from
  const [toLon, toLat] = to
  const phi1 = toRadians(fromLat)
  const phi2 = toRadians(toLat)
  const deltaLambda = toRadians(toLon - fromLon)
  const y = Math.sin(deltaLambda) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

function headingDeltaDegrees(heading: number, bearing: number): number {
  const delta = Math.abs(((bearing - heading) + 540) % 360 - 180)
  return delta
}

/**
 * A candidate is behind the rider when its approach direction diverges from
 * the current heading beyond the U-turn threshold (SB-030): accepting it
 * would force an unapproved U-turn or a road the rider has already passed.
 */
function isCandidateBehindRider(candidate: FreeRideCandidate, headingDegrees: number | null): boolean {
  if (headingDegrees == null) return false
  const entry = candidate.routeFragment[0] ?? candidate.origin
  const approach = bearingDegrees(candidate.origin, entry)
  return headingDeltaDegrees(headingDegrees, approach) > MAX_HEADING_DELTA_DEGREES
}

function formatDistance(meters: number): string {
  const miles = meters / 1609.344
  return miles < 0.1 ? `${Math.max(1, Math.round(meters))} m` : `${miles.toFixed(1)} mi`
}

function buildSuggestion(
  candidate: FreeRideCandidate,
  score: ReturnType<typeof scoreRoute>,
  now: string
): FreeRideSuggestion {
  const addedMinutes = Math.max(1, Math.round(candidate.addedDurationSeconds / 60))
  const reasons = score.explanations.slice(0, 3)
  reasons.push(`${candidate.actionLabel} in ${formatDistance(candidate.triggerDistanceMeters)}; adds about ${addedMinutes} minutes.`)
  return {
    id: candidate.id,
    kind: candidate.kind,
    title: `${candidate.title} — ${candidate.actionLabel} in ${formatDistance(candidate.triggerDistanceMeters)} — +${addedMinutes} min`,
    actionLabel: "Accept suggestion",
    origin: candidate.origin,
    destination: candidate.destination,
    routeFragment: candidate.routeFragment,
    triggerDistanceMeters: candidate.triggerDistanceMeters,
    addedDurationSeconds: candidate.addedDurationSeconds,
    score,
    reasons,
    confidence: clamp(score.confidence / 100),
    expiresAt: new Date(Date.parse(now) + SUGGESTION_TTL_MS).toISOString()
  }
}

export function rankFreeRideCandidates(
  candidates: readonly FreeRideCandidate[],
  context: FreeRideContext
): FreeRideRankingResult {
  if (context.gpsConfidence < 0.6) {
    return { suggestion: null, consideredCandidateIds: [], suppressed: true, suppressionReason: "gps-uncertain" }
  }
  if (context.workload === "high") {
    return { suggestion: null, consideredCandidateIds: [], suppressed: true, suppressionReason: "high-workload" }
  }
  const now = Date.parse(context.now)
  if (context.cooldownUntil !== undefined && now < context.cooldownUntil) {
    return { suggestion: null, consideredCandidateIds: [], suppressed: true, suppressionReason: "cooldown" }
  }

  const horizon = context.horizonMeters ?? DEFAULT_HORIZON_METERS
  const consideredCandidateIds: string[] = []
  const ranked = candidates.flatMap((candidate) => {
    consideredCandidateIds.push(candidate.id)
    if (context.rejectedCandidateIds.has(candidate.id)) return []
    if (context.recentCandidateIds.has(candidate.id)) return []
    if (candidate.triggerDistanceMeters < MIN_ACTION_DISTANCE_METERS || candidate.triggerDistanceMeters > horizon) return []
    // Directionality (SB-030): never offer a road behind the rider or one
    // that would force an unapproved U-turn.
    if (isCandidateBehindRider(candidate, context.currentHeadingDegrees)) return []
    const score = scoreRoute(candidate.route, {
      profile: context.profile,
      baselineDurationSeconds: candidate.baselineDurationSeconds ?? candidate.route.durationSeconds,
      maxDetourPct: 0.3
    })
    if (!score.accepted || score.total < 35) return []
    return [{ candidate, score }]
  }).sort((left, right) => right.score.total - left.score.total || left.candidate.triggerDistanceMeters - right.candidate.triggerDistanceMeters)

  const primary = ranked[0]
  if (!primary) {
    return {
      suggestion: null,
      consideredCandidateIds,
      suppressed: consideredCandidateIds.length > 0,
      suppressionReason: "no-safe-candidate"
    }
  }
  return {
    suggestion: buildSuggestion(primary.candidate, primary.score, context.now),
    consideredCandidateIds,
    suppressed: false
  }
}

export function acceptFreeRideSuggestion(suggestion: FreeRideSuggestion): RouteRequest {
  return {
    origin: suggestion.origin,
    destination: suggestion.destination,
    profile: "neural",
    desired: {
      maxDetourPct: 0.3,
      twistiness: suggestion.score.twistiness / 100,
      scenic: suggestion.score.scenic / 100,
      gravel: suggestion.score.gravel / 100
    }
  }
}

/**
 * Convert a suggestion into the existing route-shaped preference seam. This
 * keeps reactions local and lets the established rider-preference model learn
 * from accept/ignore signals without persisting raw GPS trails or inventing a
 * provider route.
 */
export function freeRideSuggestionAsPlannedRoute(suggestion: FreeRideSuggestion): PlannedRoute {
  return {
    id: `suggestion-${suggestion.id}`,
    name: suggestion.title,
    profile: "neural",
    geometry: suggestion.routeFragment,
    waypoints: [
      { lat: suggestion.origin[1], lon: suggestion.origin[0], label: "Suggestion origin" },
      { lat: suggestion.destination[1], lon: suggestion.destination[0], label: "Suggestion road" }
    ],
    instructions: [],
    distanceMiles: Math.max(0.1, suggestion.triggerDistanceMeters / 1609.344),
    durationMinutes: Math.max(1, suggestion.addedDurationSeconds / 60),
    ascentMeters: null,
    descentMeters: null,
    twistiness: suggestion.score.twistiness,
    turnCount: Math.max(1, Math.round(suggestion.score.twistiness / 4)),
    roadMix: { secondary: 100 },
    surfaceMix: suggestion.score.gravel >= 45 ? { gravel: 100 } : { asphalt: 100 },
    routingSource: "preview",
    previewOnly: true,
    routeScore: suggestion.score
  }
}

function eventFor(
  type: RideEvent["type"],
  suggestion: FreeRideSuggestion,
  at: string,
  privateMode: boolean
): RideEvent {
  return {
    id: `ride-event-${suggestion.id}-${Date.parse(at)}`,
    type,
    at,
    suggestionId: suggestion.id,
    segmentIds: [],
    privateMode
  }
}

export function freeRideRecommendationReducer(
  state: FreeRideRecommendationState,
  action: FreeRideRecommendationAction
): FreeRideRecommendationState {
  switch (action.type) {
    case "show":
      // Never surface an already-expired suggestion (SB-030).
      if (state.cooldownUntil > Date.now()) return state
      if (Date.parse(action.suggestion.expiresAt) <= Date.now()) return state
      return { ...state, suggestion: action.suggestion, acceptedSuggestionId: null }
    case "expire":
      return state.suggestion && Date.parse(state.suggestion.expiresAt) <= Date.parse(action.at)
        ? {
            ...state,
            suggestion: null,
            cooldownUntil: Date.parse(action.at) + SUGGESTION_COOLDOWN_MS,
            lastEvent: eventFor("suggestion-ignored", state.suggestion, action.at, state.privateMode ?? true)
          }
        : state
    case "ignore":
      return state.suggestion
        ? {
            ...state,
            suggestion: null,
            ignoredCandidateIds: [...new Set([...state.ignoredCandidateIds, state.suggestion.id])],
            cooldownUntil: Date.parse(action.at) + SUGGESTION_COOLDOWN_MS,
            lastEvent: eventFor("suggestion-ignored", state.suggestion, action.at, state.privateMode ?? true)
          }
        : state
    case "less-like-this":
      return state.suggestion
        ? {
            ...state,
            suggestion: null,
            ignoredCandidateIds: [...new Set([...state.ignoredCandidateIds, state.suggestion.id])],
            cooldownUntil: Date.parse(action.at) + SUGGESTION_COOLDOWN_MS,
            lastEvent: eventFor("less-like-this", state.suggestion, action.at, state.privateMode ?? true)
          }
        : state
    case "accept":
      return state.suggestion
        ? {
            ...state,
            suggestion: null,
            acceptedSuggestionId: state.suggestion.id,
            cooldownUntil: Date.parse(action.at) + SUGGESTION_COOLDOWN_MS,
            lastEvent: eventFor("suggestion-accepted", state.suggestion, action.at, state.privateMode ?? true)
          }
        : state
    case "reset":
      return {
        ...state,
        suggestion: null,
        acceptedSuggestionId: null,
        cooldownUntil: 0,
        lastEvent: null
      }
    case "clear":
      return { ...state, suggestion: null }
  }
}
