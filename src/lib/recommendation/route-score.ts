import type {
  Coordinate,
  RoadSegmentFeature,
  RiderPreferenceModel,
  RouteScore,
  RideProfile,
  TemporalContext
} from "@/lib/domain/contracts"

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
  baselineDurationSeconds?: number
  maxDetourPct?: number
  temporal?: TemporalContext
  rider?: RiderPreferenceModel
}

export interface RouteScoreResult extends RouteScore {
  routeId: string
  accepted: boolean
  rejectionReasons: string[]
  detourPct: number
}

interface ProfileWeights {
  twistiness: number
  scenic: number
  elevation: number
  gravel: number
  traffic: number
  simplicity: number
  novelty: number
  safety: number
  confidence: number
  eta: number
}

const PROFILE_WEIGHTS: Record<RideProfile, ProfileWeights> = {
  quick: { twistiness: 0.05, scenic: 0.05, elevation: 0.02, gravel: 0, traffic: 0.2, simplicity: 0.18, novelty: 0.02, safety: 0.2, confidence: 0.12, eta: 0.16 },
  balanced: { twistiness: 0.14, scenic: 0.12, elevation: 0.08, gravel: 0.03, traffic: 0.14, simplicity: 0.13, novelty: 0.06, safety: 0.16, confidence: 0.1, eta: 0.04 },
  twisty: { twistiness: 0.28, scenic: 0.1, elevation: 0.08, gravel: 0.03, traffic: 0.12, simplicity: 0.05, novelty: 0.1, safety: 0.12, confidence: 0.08, eta: 0.04 },
  scenic: { twistiness: 0.12, scenic: 0.24, elevation: 0.12, gravel: 0.04, traffic: 0.12, simplicity: 0.07, novelty: 0.1, safety: 0.1, confidence: 0.07, eta: 0.02 },
  adventure: { twistiness: 0.12, scenic: 0.1, elevation: 0.16, gravel: 0.22, traffic: 0.08, simplicity: 0.04, novelty: 0.1, safety: 0.1, confidence: 0.06, eta: 0.02 },
  gravel: { twistiness: 0.08, scenic: 0.08, elevation: 0.12, gravel: 0.32, traffic: 0.08, simplicity: 0.04, novelty: 0.12, safety: 0.09, confidence: 0.05, eta: 0.02 },
  "avoid-highways": { twistiness: 0.18, scenic: 0.16, elevation: 0.08, gravel: 0.04, traffic: 0.14, simplicity: 0.06, novelty: 0.08, safety: 0.12, confidence: 0.1, eta: 0.04 },
  neural: { twistiness: 0.16, scenic: 0.14, elevation: 0.1, gravel: 0.08, traffic: 0.12, simplicity: 0.08, novelty: 0.12, safety: 0.1, confidence: 0.08, eta: 0.02 }
}

const BLOCKING_FLAGS = /(?:private|illegal|closure|closed|unsafe|invalid|impassable)/i
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

function normalized(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0, 0, 1)
}

function routeGeometryIsValid(route: ScoreableRoute): boolean {
  return route.geometry.length >= 2 && route.geometry.every(([longitude, latitude]) =>
    Number.isFinite(longitude) && Number.isFinite(latitude) &&
    Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90
  )
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

function emptyScore(explanations: string[] = []): RouteScore {
  return {
    total: 0,
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
  const rejectionReasons: string[] = []
  const maxDetourPct = context.maxDetourPct ?? 0.25
  const baseline = context.baselineDurationSeconds && context.baselineDurationSeconds > 0
    ? context.baselineDurationSeconds
    : route.durationSeconds
  const detourPct = Math.max(0, (route.durationSeconds - baseline) / baseline)

  if (!routeGeometryIsValid(route)) rejectionReasons.push("The route geometry is invalid.")
  if (route.segments.length === 0) rejectionReasons.push("The route has no road-feature data.")
  if (route.confidence < 0.25) rejectionReasons.push("Routing confidence is too low for a recommendation.")
  if (detourPct > maxDetourPct) {
    rejectionReasons.push(`The route detour is ${Math.round(detourPct * 100)}%, above the ${Math.round(maxDetourPct * 100)}% limit.`)
  }

  for (const segment of route.segments) {
    if (segment.legalAccess === "private" || segment.legalAccess === "forbidden") {
      rejectionReasons.push(`Road segment ${segment.segmentId} has no legal motorcycle access.`)
    }
    if (segment.seasonalAccess === "closed") {
      rejectionReasons.push(`Road segment ${segment.segmentId} is closed.`)
    }
    if (segment.dataConfidence < 0.25) {
      rejectionReasons.push(`Road segment ${segment.segmentId} has low-confidence data.`)
    }
    if (segment.safetyFlags.some((flag) => BLOCKING_FLAGS.test(flag))) {
      rejectionReasons.push(`Road segment ${segment.segmentId} has a blocking safety or access flag.`)
    }
    if (segment.profileCompatibility?.[context.profile] === "incompatible") {
      rejectionReasons.push(`Road segment ${segment.segmentId} is incompatible with the ${context.profile} profile.`)
    }
  }

  if (rejectionReasons.length > 0) {
    const score = emptyScore(rejectionReasons)
    return { ...score, routeId: route.id, accepted: false, rejectionReasons, detourPct }
  }

  const twistiness = clamp(100 * average(route.segments, (segment) =>
    normalized(segment.curvature) * 0.45 + normalized(segment.curveDensity) * 0.35 + normalized(segment.curveSeverity) * 0.2
  ))
  const scenic = clamp(100 * average(route.segments, (segment) => normalized(segment.scenicProxy)))
  const elevation = clamp(100 * average(route.segments, (segment) => normalized(segment.elevationInterest)))
  const gravel = clamp(100 * average(route.segments, (segment) =>
    normalized(segment.gravelSuitability || (segment.surface && UNPAVED_SURFACES.has(segment.surface.toLowerCase()) ? 0.7 : 0))
  ))
  const traffic = clamp(100 * average(route.segments, (segment) => 1 - normalized(segment.trafficPenalty)))
  const simplicity = clamp(100 * average(route.segments, (segment) =>
    1 - Math.max(
      normalized(segment.signalDensity) * 0.45,
      normalized(segment.stopDensity) * 0.35,
      normalized(segment.urbanDensityPenalty) * 0.2
    )
  ))
  const novelty = clamp(100 * average(route.segments, (segment) => normalized(segment.novelty)))
  const confidence = clamp(100 * Math.min(normalized(route.confidence), average(route.segments, (segment) => normalized(segment.dataConfidence))))
  const safety = clamp(100 * average(route.segments, (segment) => {
    const incidentRisk = normalized(segment.incidentPenalty ?? 0)
    const discouraged = segment.legalAccess === "discouraged" ? 0.2 : 0
    const conditional = segment.seasonalAccess === "conditional" ? 0.1 : 0
    return Math.max(0, 1 - incidentRisk - discouraged - conditional)
  }))
  const etaPenalty = clamp(detourPct * 100)
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
  const weights = PROFILE_WEIGHTS[context.profile]
  const etaQuality = 100 - etaPenalty
  const fun = clamp(
    twistiness * 0.35 + scenic * 0.25 + elevation * 0.15 + gravel * 0.1 + novelty * 0.15
  )
  const total = clamp(
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

  const explanations: string[] = []
  if (twistiness >= 65) explanations.push(`Strong curvature and sustained bends (${Math.round(twistiness)}/100).`)
  if (scenic >= 60) explanations.push(`Scenic road character measures ${Math.round(scenic)}/100.`)
  if (traffic >= 65 && simplicity >= 65) explanations.push("Fewer traffic lights and less stop-and-go flow.")
  if (gravel >= 45) explanations.push(`Includes mapped gravel or adventure surface (${Math.round(gravel)}%).`)
  if (novelty >= 60) explanations.push(`Uses roads with high novelty for this rider (${Math.round(novelty)}/100).`)
  if (detourPct > 0.02) explanations.push(`Adds about ${Math.max(1, Math.round((route.durationSeconds - baseline) / 60))} minutes within the detour limit.`)
  if (confidence < 70) explanations.push(`Provider data confidence is ${Math.round(confidence)}/100.`)
  if (context.temporal?.traffic?.status === "unavailable") explanations.push("Live traffic is unavailable; traffic quality uses road-feature data only.")
  if (context.rider) explanations.push(`Rider preference fit is ${Math.round(preference)}/100.`)
  if (explanations.length === 0) explanations.push("Fastest valid route for the selected riding profile.")

  const score: RouteScore = {
    total: round(total),
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
  return { ...score, routeId: route.id, accepted: true, rejectionReasons, detourPct }
}
