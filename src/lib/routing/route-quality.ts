import type { Coordinate, PlannedRoute, TollPolicy } from "./types"
import { backtrackingShare, selfOverlapShare } from "./route-geometry-quality"
import { smoothedRouteMetrics } from "./scoring"
import boundaries from "./reference/pa-nj-boundaries.json"

/**
 * Phase 4: hard relevance/safety gates and the normalized maximum-twisties
 * score, with rider-facing explanations derived only from measured fields.
 *
 * The locked formulas (plan.md): components sum to 100 and penalties are
 * applied afterward. Hard gates run before scoring — a candidate cannot
 * compensate for irrelevance with a large curve score.
 */

export interface RouteQualityInput {
  route: PlannedRoute
  /** Destination time target in minutes. */
  targetMinutes: number
  start: Coordinate
  finish: Coordinate
  tollPolicy: TollPolicy
  /** PA/NJ state transitions observed on this route (Phase 4 boundary). */
  stateTransitions: number
  /** Minimum acceptable transitions for the endpoints (0 or 1). */
  minimumStateTransitions: number
  /** Validated corridor evidence miles (curvature/GPX/researched). */
  evidenceMiles: number
}

const DURATION_TOLERANCE = 0.1
const MAX_BACKTRACKING = 0.15
const MAX_SELF_OVERLAP = 0.2
const TOLL_PENALTY_PER_INTERVAL = 15
const TOLL_PENALTY_CAP = 30
const CROSSING_PENALTY_PER_EXTRA = 20

export interface GateFailures {
  duration?: string
  backtracking?: string
  selfOverlap?: string
  toll?: string
}

export interface RouteQualityComponents {
  curvatureTurns: number
  duration: number
  backroad: number
  lowUrban: number
  lowHighway: number
  evidence: number
  lowRepetition: number
  tollPenalty: number
  crossingPenalty: number
}

export interface RouteQualityReport {
  score: number
  passedGates: boolean
  failures: GateFailures
  components: RouteQualityComponents
  explanation: string[]
  metrics: {
    durationMinutes: number
    curvedDistanceShare: number
    turnsPerMile: number
    backroadShare: number
    urbanShare: number
    highwayShare: number
    backtrackingShare: number
    selfOverlapShare: number
    tollSharePercent: number | null
    stateTransitions: number
    evidenceMiles: number
  }
}

interface BoundaryFeature {
  properties: { id: string; name: string }
  geometry: { type: "Polygon"; coordinates: Coordinate[][] }
}

interface BoundaryCollection {
  features: BoundaryFeature[]
}

const boundaryCollection = boundaries as unknown as BoundaryCollection

function pointInPolygon(point: Coordinate, ring: Coordinate[]): boolean {
  const [lon, lat] = point
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [lonI, latI] = ring[index]!
    const [lonP, latP] = ring[previous]!
    const intersects = (latI > lat) !== (latP > lat) &&
      lon < ((lonP - lonI) * (lat - latI)) / (latP - latI) + lonI
    if (intersects) inside = !inside
  }
  return inside
}

function stateIdAt(point: Coordinate): string | null {
  for (const feature of boundaryCollection.features) {
    const ring = feature.geometry.coordinates[0]
    if (ring && pointInPolygon(point, ring)) return feature.properties.id
  }
  return null
}

/**
 * Count PA/NJ state transitions along a route using the tracked simplified
 * boundary fixture. The count is the number of times the route changes state
 * after the first segment.
 */
export function countStateTransitions(geometry: Coordinate[]): number {
  let current: string | null = null
  let transitions = 0
  for (const point of geometry) {
    const state = stateIdAt(point)
    if (state === null) continue
    if (current === null) {
      current = state
    } else if (state !== current) {
      transitions += 1
      current = state
    }
  }
  return transitions
}

/** Minimum reasonable transitions: zero for same-state endpoints, one for opposite. */
export function minimumStateTransitions(start: Coordinate, finish: Coordinate): number {
  const startState = stateIdAt(start)
  const finishState = stateIdAt(finish)
  if (startState === null || finishState === null) return 0
  return startState === finishState ? 0 : 1
}

/** Distinct tolled intervals from the toll evidence distribution. */
function distinctTolledIntervals(route: PlannedRoute): number {
  if (!route.tollEvidence?.known) return 0
  const share = route.tollEvidence.tollSharePercent ?? 0
  if (share <= 0) return 0
  // Approximate interval count from the tolled share: coarse but bounded.
  return Math.max(1, Math.round(share / 30))
}

export function hardGates(input: RouteQualityInput): GateFailures {
  const { route, targetMinutes, tollPolicy } = input
  const failures: GateFailures = {}

  const durationError = Math.abs(route.durationMinutes - targetMinutes) / targetMinutes
  if (durationError > DURATION_TOLERANCE) {
    failures.duration = `${route.durationMinutes} minutes is outside the ${Math.round(targetMinutes * (1 - DURATION_TOLERANCE))}–${Math.round(targetMinutes * (1 + DURATION_TOLERANCE))} minute target.`
  }

  const backtracking = backtrackingShare(route.geometry)
  if (backtracking > MAX_BACKTRACKING) {
    failures.backtracking = `${Math.round(backtracking * 100)}% immediate backtracking exceeds the ${MAX_BACKTRACKING * 100}% limit.`
  }

  const overlap = selfOverlapShare(route.geometry)
  if (overlap > MAX_SELF_OVERLAP) {
    failures.selfOverlap = `${Math.round(overlap * 100)}% self-overlap exceeds the ${MAX_SELF_OVERLAP * 100}% limit.`
  }

  if (tollPolicy === "avoid" && route.tollEvidence?.known && (route.tollEvidence.tollSharePercent ?? 0) > 0) {
    failures.toll = "This route uses tolled roads, which you asked to avoid."
  }

  // Extra state crossings are penalized by the score (-20 each), not hard
  // rejected: a toll- and crossing-heavy route still loses fairly.
  return failures
}

/**
 * Locked maximum-twisties score. All shares clamped to 0..1; penalties are
 * applied after the 100-point component sum.
 */
export function maximumTwistiesScore(input: RouteQualityInput): RouteQualityComponents {
  const { route, targetMinutes, stateTransitions, minimumStateTransitions, evidenceMiles } = input

  const metrics = smoothedRouteMetrics(route.geometry)
  const curvedShare = route.curvatureDetailShare ?? metrics.curvedDistanceShare
  const curvatureTurns = 24.5 * curvedShare + 10.5 * Math.min(1, metrics.turnsPerMile / 4)

  const duration = 25 * Math.max(0, 1 - Math.abs(route.durationMinutes - targetMinutes) / (DURATION_TOLERANCE * targetMinutes))

  const road = route.roadMix
  const backroad = 15 * ((road.secondary ?? 0) + (road.tertiary ?? 0) + (road.unclassified ?? 0)) / 100

  const urban = route.urbanDensityMix ?? {}
  const urbanShare = ((urban.CITY ?? 0) + (urban.DENSE_NEIGHBORHOOD ?? 0) + (urban.DENSIFICATION ?? 0)) / 100
  const lowUrban = 10 * (1 - Math.min(1, urbanShare))

  const highwayShare = ((road.motorway ?? 0) + (road.trunk ?? 0)) / 100
  const lowHighway = 5 * (1 - Math.min(1, highwayShare))

  const evidence = 5 * Math.min(1, evidenceMiles / Math.max(5, route.distanceMiles * 0.2))

  const backtracking = backtrackingShare(route.geometry)
  const overlap = selfOverlapShare(route.geometry)
  const lowRepetition = 5 * (1 - Math.max(backtracking / MAX_BACKTRACKING, overlap / MAX_SELF_OVERLAP))

  const tollShare = route.tollEvidence?.known ? (route.tollEvidence.tollSharePercent ?? 0) / 100 : 0
  const tollPenalty = Math.min(TOLL_PENALTY_CAP, distinctTolledIntervals(route) * TOLL_PENALTY_PER_INTERVAL) * (tollShare > 0 ? 1 : 0)

  const extraCrossings = Math.max(0, stateTransitions - minimumStateTransitions)
  const crossingPenalty = CROSSING_PENALTY_PER_EXTRA * extraCrossings

  return {
    curvatureTurns: Number(curvatureTurns.toFixed(1)),
    duration: Number(duration.toFixed(1)),
    backroad: Number(backroad.toFixed(1)),
    lowUrban: Number(lowUrban.toFixed(1)),
    lowHighway: Number(lowHighway.toFixed(1)),
    evidence: Number(evidence.toFixed(1)),
    lowRepetition: Number(lowRepetition.toFixed(1)),
    tollPenalty,
    crossingPenalty
  }
}

export function routeQualityReport(input: RouteQualityInput): RouteQualityReport {
  const failures = hardGates(input)
  const components = maximumTwistiesScore(input)
  const passedGates = Object.keys(failures).length === 0
  const rawScore = components.curvatureTurns + components.duration + components.backroad +
    components.lowUrban + components.lowHighway + components.evidence + components.lowRepetition -
    components.tollPenalty - components.crossingPenalty
  const score = Number(Math.max(0, Math.min(100, rawScore)).toFixed(1))

  const metrics = smoothedRouteMetrics(input.route.geometry)
  const road = input.route.roadMix
  const urban = input.route.urbanDensityMix ?? {}
  const urbanShare = ((urban.CITY ?? 0) + (urban.DENSE_NEIGHBORHOOD ?? 0) + (urban.DENSIFICATION ?? 0)) / 100
  const highwayShare = ((road.motorway ?? 0) + (road.trunk ?? 0)) / 100
  const backroadShare = ((road.secondary ?? 0) + (road.tertiary ?? 0) + (road.unclassified ?? 0)) / 100

  const explanation: string[] = []
  if (passedGates) {
    explanation.push(`Within the ${Math.round(input.targetMinutes * (1 - DURATION_TOLERANCE))}–${Math.round(input.targetMinutes * (1 + DURATION_TOLERANCE))} minute target (${input.route.durationMinutes} min).`)
    if (metrics.turnsPerMile >= 2) explanation.push(`${metrics.turnCount} meaningful turns (${metrics.turnsPerMile.toFixed(1)}/mile).`)
    if (backroadShare >= 0.5) explanation.push(`${Math.round(backroadShare * 100)}% secondary/tertiary/unclassified roads.`)
    if (input.route.tollEvidence?.known && (input.route.tollEvidence.tollSharePercent ?? 0) > 0) {
      explanation.push(`About ${input.route.tollEvidence.tollSharePercent}% of this route uses tolled roads.`)
    }
    if (input.stateTransitions > input.minimumStateTransitions) {
      explanation.push(`${input.stateTransitions} PA/NJ crossings — more than the minimum needed.`)
    }
    if (input.evidenceMiles > 0) explanation.push(`Uses ${Math.round(input.evidenceMiles)} miles of known-good corridor evidence.`)
  } else {
    explanation.push(...Object.values(failures))
  }

  return {
    score,
    passedGates,
    failures,
    components,
    explanation,
    metrics: {
      durationMinutes: input.route.durationMinutes,
      curvedDistanceShare: metrics.curvedDistanceShare,
      turnsPerMile: metrics.turnsPerMile,
      backroadShare: Number(backroadShare.toFixed(2)),
      urbanShare: Number(urbanShare.toFixed(2)),
      highwayShare: Number(highwayShare.toFixed(2)),
      backtrackingShare: Number(backtrackingShare(input.route.geometry).toFixed(3)),
      selfOverlapShare: Number(selfOverlapShare(input.route.geometry).toFixed(3)),
      tollSharePercent: input.route.tollEvidence?.known ? input.route.tollEvidence.tollSharePercent : null,
      stateTransitions: input.stateTransitions,
      evidenceMiles: input.evidenceMiles
    }
  }
}
