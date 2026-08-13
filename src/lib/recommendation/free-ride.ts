import type {
  Coordinate,
  FreeRideSuggestion,
  RideEvent,
  RideProfile,
  RouteRequest
} from "@/lib/domain/contracts"
import type { PlannedRoute } from "@/lib/routing/types"
import { haversine } from "@/lib/routing/scoring"
import { scoreRoute, type ScoreableRoute } from "./route-score"
import {
  findFreeRideOpportunities,
  fragmentTraversalRatio,
  type FreeRideGraphIndex
} from "./free-ride-graph"

export { fragmentTraversalRatio }

export interface FreeRideCandidate {
  id: string
  kind: FreeRideSuggestion["kind"]
  title: string
  actionLabel: string
  origin: [number, number]
  destination: [number, number]
  via?: Coordinate[]
  routeFragment: [number, number][]
  triggerDistanceMeters: number
  addedDurationSeconds: number
  /**
   * Optional direct-route baseline. A curvature-only candidate does not know
   * the rider's final destination, so it must not invent an ETA comparison.
   */
  baselineDurationSeconds?: number
  route: ScoreableRoute
  provenance?: FreeRideSuggestion["provenance"]
}

/**
 * Fraction (0–1) of the proposed road fragment that the routed geometry
 * actually covers (SB-031): the acceptance route must traverse the suggested
 * road, otherwise the suggestion was not honored.
 */
export interface FreeRideContext {
  now: string
  profile: RideProfile
  gpsConfidence: number
  workload: "low" | "normal" | "high"
  currentCoordinate: [number, number]
  currentHeadingDegrees: number | null
  speedMph?: number
  recentSegmentUids?: ReadonlySet<string>
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
  /** Bounded local prompt history for sparse in-session interruptions. */
  promptedAt?: number[]
  /** Bounded local ignore history for escalating quiet periods. */
  ignoredAt?: number[]
}

export type FreeRideRecommendationAction =
  | { type: "show"; suggestion: FreeRideSuggestion; at?: string }
  | { type: "ignore"; at: string }
  | { type: "less-like-this"; at: string }
  | { type: "accept"; at: string }
  | { type: "expire"; at: string }
  | { type: "reset" }
  | { type: "clear" }

const MIN_ACTION_DISTANCE_METERS = 400
const DEFAULT_HORIZON_METERS = 16_000
const SUGGESTION_TTL_MS = 45_000
const SUGGESTION_COOLDOWN_MS = 5 * 60_000
const TWO_IGNORE_QUIET_MS = 20 * 60_000
const PROMPT_WINDOW_MS = 60 * 60_000
const MAX_PROMPTS_PER_WINDOW = 3
const MAX_IGNORED_CANDIDATES = 32
const MAX_HISTORY = 8
/** Heading difference beyond which a candidate requires a U-turn (SB-030). */
const MAX_HEADING_DELTA_DEGREES = 100
const MIN_CORRIDOR_TRAVERSAL_RATIO = 0.8

export interface FreeRideRouteProviderOptions {
  signal?: AbortSignal
}

export type FreeRideRouteProvider = (
  request: RouteRequest,
  options?: FreeRideRouteProviderOptions
) => Promise<ScoreableRoute>

export interface FreeRideCandidateBuildResult {
  candidates: FreeRideCandidate[]
  opportunityCount: number
  providerFailures: number
}

/**
 * Route each directed RIG opportunity against the same rejoin baseline. A
 * failed provider call or an unhonoured corridor is discarded, never dressed
 * up as a suggestion.
 */
export async function buildGraphBackedFreeRideCandidates(
  context: FreeRideContext,
  graph: FreeRideGraphIndex,
  routeProvider: FreeRideRouteProvider,
  options: FreeRideRouteProviderOptions = {}
): Promise<FreeRideCandidateBuildResult> {
  const opportunities = findFreeRideOpportunities(
    graph,
    context.currentCoordinate,
    context.currentHeadingDegrees,
    context.speedMph,
    context.recentSegmentUids
  )
  const candidates: FreeRideCandidate[] = []
  let providerFailures = 0
  for (const opportunity of opportunities) {
    if (options.signal?.aborted) break
    const request = {
      origin: opportunity.origin,
      destination: opportunity.destination,
      profile: context.profile
    } satisfies RouteRequest
    try {
      const baseline = await routeProvider(request, options)
      const detour = await routeProvider({ ...request, via: opportunity.via }, options)
      if (!Number.isFinite(baseline.durationSeconds) || !Number.isFinite(detour.durationSeconds) ||
        fragmentTraversalRatio(detour.geometry, opportunity.routeFragment) < MIN_CORRIDOR_TRAVERSAL_RATIO) {
        continue
      }
      const corridor = opportunity.corridor
      candidates.push({
        id: opportunity.id,
        kind: corridor.dominantRole === "highlight" ? "fun-road" : "scenic-detour",
        title: corridor.dominantRole === "highlight" ? "Verified road corridor ahead" : "Interesting road corridor ahead",
        actionLabel: "Take corridor",
        origin: opportunity.origin,
        destination: opportunity.destination,
        via: opportunity.via,
        routeFragment: opportunity.routeFragment,
        triggerDistanceMeters: opportunity.triggerDistanceMeters,
        addedDurationSeconds: Math.max(0, detour.durationSeconds - baseline.durationSeconds),
        baselineDurationSeconds: baseline.durationSeconds,
        route: detour,
        provenance: {
          source: "rig",
          sourceBuild: graph.sourceBuild,
          graphVersion: graph.graphVersion,
          builtAt: graph.builtAt,
          corridorId: corridor.corridorId,
          segmentUids: [...corridor.segmentUids],
          expectedUtility: corridor.expectedUtility,
          confidence: corridor.confidence,
          lengthMeters: corridor.lengthMeters
        }
      })
    } catch (error) {
      if (options.signal?.aborted) break
      providerFailures += 1
      if (!(error instanceof Error)) continue
    }
  }
  return { candidates, opportunityCount: opportunities.length, providerFailures }
}

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
  const addedMinutes = Math.max(0, Math.round(candidate.addedDurationSeconds / 60))
  const reasons = score.explanations.slice(0, 3)
  if (candidate.provenance) {
    reasons.push(`Verified RIG corridor evidence covers about ${Math.round(candidate.provenance.lengthMeters)} meters.`)
  }
  reasons.push(`${candidate.actionLabel} in ${formatDistance(candidate.triggerDistanceMeters)}; adds about ${addedMinutes} minutes.`)
  return {
    id: candidate.id,
    kind: candidate.kind,
    title: `${candidate.title} — ${candidate.actionLabel} in ${formatDistance(candidate.triggerDistanceMeters)} — +${addedMinutes} min`,
    actionLabel: "Accept suggestion",
    origin: candidate.origin,
    destination: candidate.destination,
    ...(candidate.via ? { via: candidate.via } : {}),
    routeFragment: candidate.routeFragment,
    triggerDistanceMeters: candidate.triggerDistanceMeters,
    addedDurationSeconds: candidate.addedDurationSeconds,
    score,
    reasons,
    confidence: clamp(Math.min(
      score.confidence / 100,
      candidate.provenance?.confidence ?? 1
    )),
    ...(candidate.provenance ? { provenance: candidate.provenance } : {}),
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
  }).sort((left, right) => {
    const leftRank = left.score.total + (left.candidate.provenance?.expectedUtility ?? 0) * 10
    const rightRank = right.score.total + (right.candidate.provenance?.expectedUtility ?? 0) * 10
    return rightRank - leftRank || left.candidate.triggerDistanceMeters - right.candidate.triggerDistanceMeters
  })

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
    ...(suggestion.via ? { via: suggestion.via } : {}),
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
  const fragmentMeters = suggestion.routeFragment.slice(1).reduce(
    (total, point, index) => total + haversine(suggestion.routeFragment[index]!, point),
    0
  )
  return {
    id: `suggestion-${suggestion.id}`,
    name: suggestion.title,
    profile: "neural",
    geometry: suggestion.routeFragment,
    waypoints: [
      { lat: suggestion.origin[1], lon: suggestion.origin[0], label: "Suggestion origin" },
      ...((suggestion.via ?? []).map(([lon, lat], index) => ({ lat, lon, label: `Suggestion anchor ${index + 1}` }))),
      { lat: suggestion.destination[1], lon: suggestion.destination[0], label: "Suggestion rejoin" }
    ],
    instructions: [],
    distanceMiles: Math.max(0.1, fragmentMeters / 1609.344),
    durationMinutes: Math.max(1, suggestion.addedDurationSeconds / 60),
    ascentMeters: null,
    descentMeters: null,
    twistiness: suggestion.score.twistiness,
    turnCount: 0,
    // Preference learning receives the score and provenance separately. An
    // advisory fragment has no provider detail distribution to copy here.
    roadMix: {},
    surfaceMix: {},
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
    segmentIds: suggestion.provenance?.segmentUids ?? [],
    privateMode
  }
}

function actionTime(at: string | undefined, fallback = Date.now()): number {
  const parsed = at ? Date.parse(at) : fallback
  return Number.isFinite(parsed) ? parsed : fallback
}

function recentHistory(values: readonly number[] | undefined, now: number, windowMs: number): number[] {
  return (values ?? []).filter((value) => Number.isFinite(value) && value <= now && now - value < windowMs)
}

function boundedCandidateIds(ids: readonly string[], id: string): string[] {
  return [...new Set([...ids, id])].slice(-MAX_IGNORED_CANDIDATES)
}

export function freeRideRecommendationReducer(
  state: FreeRideRecommendationState,
  action: FreeRideRecommendationAction
): FreeRideRecommendationState {
  switch (action.type) {
    case "show": {
      const at = actionTime(action.at)
      const promptedAt = recentHistory(state.promptedAt, at, PROMPT_WINDOW_MS)
      // Never surface an already-expired or quiet-period suggestion (SB-030).
      if (state.cooldownUntil > at || Date.parse(action.suggestion.expiresAt) <= at) {
        return { ...state, promptedAt }
      }
      if (promptedAt.length >= MAX_PROMPTS_PER_WINDOW) {
        return {
          ...state,
          suggestion: null,
          promptedAt,
          cooldownUntil: Math.max(state.cooldownUntil, promptedAt[0]! + PROMPT_WINDOW_MS)
        }
      }
      return {
        ...state,
        suggestion: action.suggestion,
        acceptedSuggestionId: null,
        promptedAt: [...promptedAt, at].slice(-MAX_PROMPTS_PER_WINDOW)
      }
    }
    case "expire": {
      const at = actionTime(action.at)
      return state.suggestion && Date.parse(state.suggestion.expiresAt) <= at
        ? {
            ...state,
            suggestion: null,
            cooldownUntil: at + SUGGESTION_COOLDOWN_MS,
            lastEvent: eventFor("suggestion-ignored", state.suggestion, action.at, state.privateMode ?? true)
          }
        : state
    }
    case "ignore": {
      const at = actionTime(action.at)
      const ignoredAt = [...recentHistory(state.ignoredAt, at, PROMPT_WINDOW_MS), at].slice(-MAX_HISTORY)
      return state.suggestion
        ? {
            ...state,
            suggestion: null,
            ignoredCandidateIds: boundedCandidateIds(state.ignoredCandidateIds, state.suggestion.id),
            ignoredAt,
            cooldownUntil: at + (ignoredAt.length >= 2 ? TWO_IGNORE_QUIET_MS : SUGGESTION_COOLDOWN_MS),
            lastEvent: eventFor("suggestion-ignored", state.suggestion, action.at, state.privateMode ?? true)
          }
        : state
    }
    case "less-like-this": {
      const at = actionTime(action.at)
      const ignoredAt = [...recentHistory(state.ignoredAt, at, PROMPT_WINDOW_MS), at].slice(-MAX_HISTORY)
      return state.suggestion
        ? {
            ...state,
            suggestion: null,
            ignoredCandidateIds: boundedCandidateIds(state.ignoredCandidateIds, state.suggestion.id),
            ignoredAt,
            cooldownUntil: at + TWO_IGNORE_QUIET_MS,
            lastEvent: eventFor("less-like-this", state.suggestion, action.at, state.privateMode ?? true)
          }
        : state
    }
    case "accept": {
      const at = actionTime(action.at)
      return state.suggestion
        ? {
            ...state,
            suggestion: null,
            acceptedSuggestionId: state.suggestion.id,
            cooldownUntil: at + SUGGESTION_COOLDOWN_MS,
            lastEvent: eventFor("suggestion-accepted", state.suggestion, action.at, state.privateMode ?? true)
          }
        : state
    }
    case "reset":
      return {
        ...state,
        suggestion: null,
        acceptedSuggestionId: null,
        cooldownUntil: 0,
        lastEvent: null,
        promptedAt: [],
        ignoredAt: []
      }
    case "clear":
      return { ...state, suggestion: null }
  }
}
