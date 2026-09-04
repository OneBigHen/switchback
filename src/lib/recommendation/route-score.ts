import type {
  Coordinate,
  RoadSegmentFeature,
  RiderPreferenceModel,
  RouteScore,
  RideProfile,
  TemporalContext
} from "@/lib/domain/contracts"
import { evaluateFeatureEligibility } from "@/lib/domain/routing/eligibility"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import { backtrackingShare, selfOverlapShare } from "@/lib/routing/route-geometry-quality"
import { haversine } from "@/lib/routing/scoring"
import { corridorAdherence, type CorridorAdherence } from "@/lib/routing/sketch-corridor"
import { isRoutePolicy, PA_NJ_ROUTE_POLICY_V1, type RoutePolicy } from "./route-policy"

export interface RouteUtilityBreakdown {
  segmentUtility: number
  contiguousQuality: number
  contiguousQualityBonus: number
  corridorCoherenceBonus: number
  personalPreferenceFit: number
  uncertaintyPenalty: number
  backtrackPenalty: number
  selfOverlapShare: number
  selfOverlapPenalty: number
  fragmentationPenalty: number
  detourPenalty: number
  /** Cost of wandering off the rider's drawn stroke; 0 when none was drawn. */
  corridorAdherencePenalty: number
  total: number
}

export interface ScoreableRoute {
  id: string
  geometry: Coordinate[]
  distanceMeters: number
  durationSeconds: number
  confidence: number
  segments: RoadSegmentFeature[]
}

export interface RouteScoringContext {
  profile: RideProfile
  bikeProfile?: BikeProfile
  baselineDurationSeconds?: number
  maxDetourPct?: number
  temporal?: TemporalContext
  rider?: RiderPreferenceModel
  policy?: RoutePolicy
  /**
   * The rider's free-draw stroke as a soft corridor. When present, deviation
   * from it becomes a scored axis alongside curvature, traffic, and detour —
   * never a hard filter, so a better road just off the line can still win.
   */
  corridor?: { samples: Coordinate[]; envelopeMeters: number }
}

export interface RouteScoreResult extends RouteScore {
  routeId: string
  accepted: boolean
  rejectionReasons: string[]
  detourPct: number
  utility?: RouteUtilityBreakdown
  /** Measured fit against the drawn stroke; absent when no corridor was given. */
  corridorFit?: CorridorAdherence
}

const UNPAVED_SURFACES = new Set(["dirt", "earth", "gravel", "fine_gravel", "grass", "ground", "mud", "sand", "unpaved"])

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function average(segments: RoadSegmentFeature[], value: (segment: RoadSegmentFeature) => number): number {
  if (segments.length === 0) return 0
  const totalDistance = segments.reduce((sum, segment) => sum + Math.max(0, segment.distanceMeters), 0)
  if (totalDistance <= 0) return segments.reduce((sum, segment) => sum + value(segment), 0) / segments.length
  return segments.reduce((sum, segment) => sum + value(segment) * Math.max(0, segment.distanceMeters), 0) / totalDistance
}

function normalized(value: number | undefined, fallback = 0): number {
  return clamp(Number.isFinite(value) ? value! : fallback, 0, 1)
}

function piecewiseDetourPenalty(detourPct: number, maxDetourPct: number, preferredDetourPct: number): number {
  const preferredBand = Math.min(preferredDetourPct, maxDetourPct)
  if (detourPct <= preferredBand) return clamp(detourPct * 20)
  const ramp = Math.max(0.05, maxDetourPct - preferredBand)
  const progress = clamp((detourPct - preferredBand) / ramp, 0, 1)
  return clamp(preferredBand * 20 + progress ** 2 * 48)
}

function segmentUtility(segment: RoadSegmentFeature, profile: RideProfile, policy: RoutePolicy): number {
  const weights = policy.profileWeights[profile]
  const twistiness = normalized(segment.curvature) * 0.45 +
    normalized(segment.curveDensity) * 0.35 + normalized(segment.curveSeverity) * 0.2
  const scenic = normalized(segment.scenicProxy)
  const elevation = normalized(segment.elevationInterest, 0.5)
  const gravel = normalized(segment.gravelSuitability ?? (
    segment.surface && UNPAVED_SURFACES.has(segment.surface.toLowerCase()) ? 0.7 : 0
  ))
  const traffic = 1 - normalized(segment.trafficPenalty, 0.5)
  const simplicity = 1 - Math.max(
    normalized(segment.signalDensity, 0.5) * 0.45,
    normalized(segment.stopDensity, 0.5) * 0.35,
    normalized(segment.urbanDensityPenalty, 0.5) * 0.2
  )
  const novelty = normalized(segment.novelty, 0.5)
  const safety = Math.max(
    0,
    1 - normalized(segment.incidentPenalty, 0.5) -
      (segment.legalAccess === "discouraged" ? 0.2 : 0) -
      (segment.seasonalAccess === "conditional" ? 0.1 : 0)
  )
  const confidence = normalized(segment.dataConfidence, 0.5)
  const weightTotal = weights.twistiness + weights.scenic + weights.elevation + weights.gravel +
    weights.traffic + weights.simplicity + weights.novelty + weights.safety + weights.confidence
  return clamp((
    twistiness * weights.twistiness +
    scenic * weights.scenic +
    elevation * weights.elevation +
    gravel * weights.gravel +
    traffic * weights.traffic +
    simplicity * weights.simplicity +
    novelty * weights.novelty +
    safety * weights.safety +
    confidence * weights.confidence
  ) / Math.max(0.01, weightTotal))
}

function contiguousUtility(
  segments: RoadSegmentFeature[],
  profile: RideProfile,
  policy: RoutePolicy
): Pick<RouteUtilityBreakdown, "segmentUtility" | "contiguousQuality" | "contiguousQualityBonus" | "corridorCoherenceBonus" | "fragmentationPenalty"> {
  if (segments.length === 0) {
    return {
      segmentUtility: 0,
      contiguousQuality: 0,
      contiguousQualityBonus: 0,
      corridorCoherenceBonus: 0,
      fragmentationPenalty: 0
    }
  }

  const values = segments.map((segment) => ({
    distanceMeters: Math.max(0, segment.distanceMeters),
    quality: segmentUtility(segment, profile, policy)
  }))
  const totalDistance = values.reduce((sum, value) => sum + value.distanceMeters, 0)
  const weightedUtility = totalDistance > 0
    ? values.reduce((sum, value) => sum + value.quality * value.distanceMeters, 0) / totalDistance
    : values.reduce((sum, value) => sum + value.quality, 0) / values.length

  const runs: Array<{ distanceMeters: number; qualities: number[] }> = []
  let current = { distanceMeters: values[0]!.distanceMeters, qualities: [values[0]!.quality] }
  for (let index = 1; index < values.length; index += 1) {
    const previous = segments[index - 1]!
    const next = segments[index]!
    const previousEnd = previous.geometry[previous.geometry.length - 1]
    const nextStart = next.geometry[0]
    // ponytail: endpoint proximity is a bounded topology proxy until canonical segment linkage is attached.
    const connected = previousEnd !== undefined && nextStart !== undefined &&
      haversine(previousEnd, nextStart) <= 100
    if (connected) {
      current = {
        distanceMeters: current.distanceMeters + values[index]!.distanceMeters,
        qualities: [...current.qualities, values[index]!.quality]
      }
    } else {
      runs.push(current)
      current = { distanceMeters: values[index]!.distanceMeters, qualities: [values[index]!.quality] }
    }
  }
  runs.push(current)

  const qualifyingRuns = runs
    .filter((run) => run.qualities.length > 1 && run.distanceMeters >= 1_000)
    .map((run) => {
      const mean = run.qualities.reduce((sum, value) => sum + value, 0) / run.qualities.length
      const variance = run.qualities.reduce((sum, value) => sum + (value - mean) ** 2, 0) / run.qualities.length
      return {
        ...run,
        mean,
        coherence: clamp(1 - Math.sqrt(variance) / 0.5)
      }
    })
  const contiguousMeters = qualifyingRuns.reduce((sum, run) => sum + run.distanceMeters, 0)
  const contiguousQuality = totalDistance > 0 ? contiguousMeters / totalDistance : 0
  const coherence = qualifyingRuns.length > 0
    ? qualifyingRuns.reduce((sum, run) => sum + run.coherence * run.distanceMeters, 0) / contiguousMeters
    : 0
  const contiguousQualityBonus = qualifyingRuns.reduce(
    (sum, run) => sum + run.mean * Math.log1p(run.distanceMeters / 1_000) * run.coherence * 3,
    0
  )

  return {
    segmentUtility: weightedUtility,
    contiguousQuality,
    contiguousQualityBonus,
    corridorCoherenceBonus: contiguousQuality * coherence * 2,
    fragmentationPenalty: Math.max(0, runs.length - 1) * 0.5
  }
}

function uncertaintyPenalty(route: ScoreableRoute): number {
  if (route.segments.length === 0) return 6
  let unknownFacts = 0
  for (const segment of route.segments) {
    if (!segment.surface || segment.surface.toLowerCase() === "unknown") unknownFacts += 1
    if (segment.legalAccess === "unknown") unknownFacts += 1
    if (segment.seasonalAccess === "unknown") unknownFacts += 1
    if (segment.dataConfidence === undefined) unknownFacts += 1
  }
  const featureConfidence = average(route.segments, (segment) => normalized(segment.dataConfidence, 0.5))
  const routeConfidence = Math.min(normalized(route.confidence, 0.5), featureConfidence)
  const unknownRate = unknownFacts / (route.segments.length * 4)
  return clamp((1 - routeConfidence) * 6 + unknownRate * 6, 0, 15)
}

/**
 * Weight of the drawn-corridor axis. Sized so a route that ignores the stroke
 * entirely loses roughly as much as a heavily backtracking one — enough to
 * matter, not enough to override a genuinely better road nearby.
 */
const CORRIDOR_ADHERENCE_WEIGHT = 14

function buildUtility(
  route: ScoreableRoute,
  context: RouteScoringContext,
  detourPct: number,
  baseTotal: number,
  preference: number,
  maxDetourPct: number,
  policy: RoutePolicy,
  adherence: CorridorAdherence | null
): RouteUtilityBreakdown {
  const contiguous = contiguousUtility(route.segments, context.profile, policy)
  const backtrack = backtrackingShare(route.geometry)
  const overlap = selfOverlapShare(route.geometry)
  const uncertainty = uncertaintyPenalty(route)
  const detourPenalty = piecewiseDetourPenalty(detourPct, maxDetourPct, policy.preferredDetourPct)
  const backtrackPenalty = backtrack * 20
  const selfOverlapPenalty = overlap * 20
  const corridorAdherencePenalty = adherence
    ? (1 - clamp(adherence.score, 0, 100) / 100) * CORRIDOR_ADHERENCE_WEIGHT
    : 0
  const total = clamp(
    baseTotal +
    contiguous.contiguousQualityBonus +
    contiguous.corridorCoherenceBonus -
    uncertainty -
    backtrackPenalty -
    selfOverlapPenalty -
    contiguous.fragmentationPenalty -
    corridorAdherencePenalty
  )
  return {
    ...contiguous,
    personalPreferenceFit: preference * 0.12,
    uncertaintyPenalty: uncertainty,
    backtrackPenalty,
    selfOverlapShare: overlap,
    selfOverlapPenalty,
    detourPenalty,
    corridorAdherencePenalty,
    total
  }
}

interface PreferenceMetrics {
  twistiness: number
  scenic: number
  gravel: number
  elevation: number
  novelty: number
  lowTraffic: number
  simplicity: number
  etaPenalty: number
}

function preferenceFit(
  metrics: PreferenceMetrics,
  rider: RiderPreferenceModel | undefined
): number {
  if (!rider) return 50
  const weights = rider.profileWeights
  const total = Object.values(weights).reduce((sum, value) => sum + Math.max(0, value), 0) || 1
  const fit =
    metrics.twistiness * weights.twistiness +
    metrics.scenic * weights.scenic +
    metrics.gravel * weights.gravel +
    metrics.elevation * weights.elevation +
    metrics.novelty * weights.novelty +
    metrics.lowTraffic * weights.lowTraffic +
    metrics.simplicity * weights.simplicity +
    (1 - metrics.etaPenalty) * (1 - weights.etaSensitivity)
  return clamp((fit / total) * 100)
}

function emptyScore(explanations: string[] = [], policyVersion?: string): RouteScore {
  return {
    total: 0,
    policyVersion,
    fun: 0,
    twistiness: 0,
    scenic: 0,
    elevation: 0,
    gravel: 0,
    traffic: 0,
    simplicity: 0,
    safety: 0,
    novelty: 0,
    confidence: 0,
    preferenceFit: 0,
    etaPenalty: 100,
    explanations,
    explanation: explanations
  }
}

function round(value: number): number {
  return Number(value.toFixed(1))
}

export function scoreRoute(route: ScoreableRoute, context: RouteScoringContext): RouteScoreResult {
  const policy = context.policy ?? PA_NJ_ROUTE_POLICY_V1
  if (!isRoutePolicy(policy)) throw new Error("Invalid route policy")
  const rejectionReasons: string[] = []
  const maxDetourPct = context.maxDetourPct ?? 0.25
  const baseline = context.baselineDurationSeconds && context.baselineDurationSeconds > 0
    ? context.baselineDurationSeconds
    : route.durationSeconds
  const detourPct = Math.max(0, (route.durationSeconds - baseline) / baseline)

  const adherence = context.corridor && context.corridor.samples.length >= 2
    ? corridorAdherence(route.geometry, context.corridor.samples, context.corridor.envelopeMeters)
    : null

  const eligibility = evaluateFeatureEligibility(route, {
    profile: context.profile,
    bikeProfile: context.bikeProfile
  })
  rejectionReasons.push(...eligibility.failures.map((failure) => failure.message))
  if (detourPct > maxDetourPct) {
    rejectionReasons.push(`The route detour is ${Math.round(detourPct * 100)}%, above the ${Math.round(maxDetourPct * 100)}% limit.`)
  }

  if (rejectionReasons.length > 0) {
    const score = emptyScore(rejectionReasons, policy.version)
    return {
      ...score,
      routeId: route.id,
      accepted: false,
      rejectionReasons,
      detourPct,
      ...(adherence ? { corridorFit: adherence } : {})
    }
  }

  const twistiness = clamp(100 * average(route.segments, (segment) =>
    normalized(segment.curvature) * 0.45 + normalized(segment.curveDensity) * 0.35 + normalized(segment.curveSeverity) * 0.2
  ))
  const scenic = clamp(100 * average(route.segments, (segment) => normalized(segment.scenicProxy)))
  const elevation = clamp(100 * average(route.segments, (segment) => normalized(segment.elevationInterest, 0.5)))
  const gravel = clamp(100 * average(route.segments, (segment) =>
    normalized(segment.gravelSuitability ?? (segment.surface && UNPAVED_SURFACES.has(segment.surface.toLowerCase()) ? 0.7 : 0))
  ))
  const traffic = clamp(100 * average(route.segments, (segment) => 1 - normalized(segment.trafficPenalty, 0.5)))
  const simplicity = clamp(100 * average(route.segments, (segment) =>
    1 - Math.max(
      normalized(segment.signalDensity, 0.5) * 0.45,
      normalized(segment.stopDensity, 0.5) * 0.35,
      normalized(segment.urbanDensityPenalty, 0.5) * 0.2
    )
  ))
  const novelty = clamp(100 * average(route.segments, (segment) => normalized(segment.novelty, 0.5)))
  const confidence = clamp(100 * Math.min(
    normalized(route.confidence, 0.5),
    average(route.segments, (segment) => normalized(segment.dataConfidence, 0.5))
  ))
  const safety = clamp(100 * average(route.segments, (segment) => {
    const incidentRisk = normalized(segment.incidentPenalty, 0.5)
    const discouraged = segment.legalAccess === "discouraged" ? 0.2 : 0
    const conditional = segment.seasonalAccess === "conditional" ? 0.1 : 0
    return Math.max(0, 1 - incidentRisk - discouraged - conditional)
  }))
  const etaPenalty = piecewiseDetourPenalty(detourPct, maxDetourPct, policy.preferredDetourPct)
  const lowTraffic = traffic / 100
  const preference = preferenceFit({
    twistiness: twistiness / 100,
    scenic: scenic / 100,
    gravel: gravel / 100,
    elevation: elevation / 100,
    novelty: novelty / 100,
    lowTraffic,
    simplicity: simplicity / 100,
    etaPenalty: etaPenalty / 100
  }, context.rider)
  const weights = policy.profileWeights[context.profile]
  const etaQuality = 100 - etaPenalty
  const fun = clamp(
    twistiness * 0.35 + scenic * 0.25 + elevation * 0.15 + gravel * 0.1 + novelty * 0.15
  )
  const baseTotal = clamp(
    twistiness * weights.twistiness +
    scenic * weights.scenic +
    elevation * weights.elevation +
    gravel * weights.gravel +
    traffic * weights.traffic +
    simplicity * weights.simplicity +
    novelty * weights.novelty +
    safety * weights.safety +
    confidence * weights.confidence +
    etaQuality * weights.eta +
    preference * 0.12
  )
  const utility = buildUtility(route, context, detourPct, baseTotal, preference, maxDetourPct, policy, adherence)

  const explanations: string[] = eligibility.warnings.map((warning) => warning.message)
  if (twistiness >= 65) explanations.push(`Strong curvature and sustained bends (${Math.round(twistiness)}/100).`)
  if (scenic >= 60) explanations.push(`Scenic road character measures ${Math.round(scenic)}/100.`)
  if (traffic >= 65 && simplicity >= 65) explanations.push("Fewer traffic lights and less stop-and-go flow.")
  if (gravel >= 45) explanations.push(`Includes mapped gravel or adventure surface (${Math.round(gravel)}%).`)
  if (novelty >= 60) explanations.push(`Uses roads with high novelty for this rider (${Math.round(novelty)}/100).`)
  if (detourPct > 0.02) explanations.push(`Adds about ${Math.max(1, Math.round((route.durationSeconds - baseline) / 60))} minutes within the detour limit.`)
  if (utility.contiguousQualityBonus > 0) explanations.push("Sustained connected road quality earns a diminishing-continuity bonus.")
  if (utility.uncertaintyPenalty >= 4) explanations.push("Unknown road-feature coverage adds an explicit uncertainty penalty.")
  if (utility.backtrackPenalty > 0) explanations.push("Immediate backtracking reduces route utility.")
  if (utility.selfOverlapPenalty > 0) explanations.push("Repeated corridor overlap reduces route utility.")
  if (utility.fragmentationPenalty > 0) explanations.push("Disconnected feature runs reduce corridor coherence.")
  if (utility.detourPenalty > 2) explanations.push("Detour cost rises after the preferred time band.")
  if (adherence) {
    explanations.push(
      `Covers ${Math.round(adherence.coveredShare * 100)}% of your drawn line (about ${adherence.meanDeviationMeters} m off on average).`
    )
  }
  if (confidence < 70) explanations.push(`Provider data confidence is ${Math.round(confidence)}/100.`)
  if (context.temporal?.traffic?.status === "unavailable") explanations.push("Live traffic is unavailable; traffic quality uses road-feature data only.")
  if (context.rider) explanations.push(`Rider preference fit is ${Math.round(preference)}/100.`)
  if (explanations.length === 0) explanations.push("Fastest valid route for the selected riding profile.")

  const score: RouteScore = {
    total: round(utility.total),
    policyVersion: policy.version,
    ...(adherence ? { corridorAdherence: adherence.score } : {}),
    fun: round(fun),
    twistiness: round(twistiness),
    scenic: round(scenic),
    elevation: round(elevation),
    gravel: round(gravel),
    traffic: round(traffic),
    simplicity: round(simplicity),
    safety: round(safety),
    novelty: round(novelty),
    confidence: round(confidence),
    preferenceFit: round(preference),
    etaPenalty: round(etaPenalty),
    explanations,
    explanation: explanations
  }
  return {
    ...score,
    routeId: route.id,
    accepted: true,
    rejectionReasons,
    detourPct,
    utility,
    ...(adherence ? { corridorFit: adherence } : {})
  }
}
