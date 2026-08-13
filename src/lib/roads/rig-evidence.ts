/**
 * Geometry-free RIG evidence. Canonical segment identity is the only road
 * reference here; topology and route geometry belong to their owning graph.
 */

export const RIG_DIMENSION_KEYS = [
  "twistyInterest",
  "gravelInterest",
  "dirtInterest",
  "scenicProxy",
  "elevationInterest",
  "remoteness",
  "flow",
  "pavedTouringInterest",
  "technicalityEstimate",
  "communityInterest",
  "familiarity",
  "novelty"
] as const

export type RigDimensionKey = typeof RIG_DIMENSION_KEYS[number]

export const RIG_SOURCE_WEIGHTS = {
  "device-recorded-human-ride": 1,
  "creator-verified-ride": 0.75,
  "curated-planned-route": 0.45,
  "imported-unknown-provenance": 0.2,
  "switchback-generated-route": 0,
  "official-authority": 1
} as const

export type RigEvidenceSource = keyof typeof RIG_SOURCE_WEIGHTS
export type RigEvidenceKind =
  | "desirability"
  | "hard-authority"
  | "soft-current-report"
  | "preference-positive"
  | "preference-negative"
export type RigRouteRole = "highlight" | "supporting" | "connector" | "unknown"

export interface RouteRoleSignals {
  intrinsicInterest: number
  independentRepeatSelection: number
  contiguousLengthQuality: number
  deviationFromFastConnector: number
  explicitPositiveNotes: number
  signalConfidence: number
}

export interface RouteRoleInference {
  role: RigRouteRole
  score: number
  signalConfidence: number
}

export interface RigEvidenceObservation {
  /** SHA-256 canonical segment UID; provider edge IDs are not accepted. */
  segmentUid: string
  contributorId: string
  duplicateFamilyId: string
  source: RigEvidenceSource
  kind: RigEvidenceKind
  routeRole: RigRouteRole
  /** Calibrated role weight; ignored for authority and explicit preference events. */
  routeRoleWeight: number
  observedAt: string
  mapMatchConfidence: number
  coveredFraction: number
  dimensions?: Partial<Record<RigDimensionKey, number>>
  surfaceConfidence?: number
}

export interface RigAggregationOptions {
  now?: string
  /** Bound the input batch before any grouping or aggregation. */
  maxObservations?: number
  /** Per-contributor/channel positive evidence cap for one segment. */
  contributorCap?: number
  /** Evidence mass required for a materially confident aggregate. */
  kappa?: number
  /** Diversity mass required for independent-source saturation. */
  diversityDelta?: number
  desirabilityHalfLifeDays?: number
  softReportHalfLifeDays?: number
}

export interface RigPreferencePosterior {
  alpha: number
  beta: number
  mean: number
}

export interface RigSegmentAggregate {
  segmentUid: string
  dominantRole: RigRouteRole
  dimensions: Partial<Record<RigDimensionKey, number>>
  totalEvidenceWeight: number
  evidenceConfidence: number
  evidenceStrength: number
  independentSourceCount: number
  maxContributorWeight: number
  accessConfidence: number
  surfaceConfidence?: number
  hardAuthorityWeight: number
  softCurrentReportWeight: number
  preference: RigPreferencePosterior
  observationCount: number
}

const SEGMENT_UID = /^[a-f0-9]{64}$/
const MAX_IDENTIFIER_LENGTH = 128
const DEFAULT_MAX_OBSERVATIONS = 512
const DEFAULT_CONTRIBUTOR_CAP = 1
const DEFAULT_KAPPA = 2
const DEFAULT_DIVERSITY_DELTA = 2
const DEFAULT_DESIRABILITY_HALF_LIFE_DAYS = 1_095
const DEFAULT_SOFT_REPORT_HALF_LIFE_DAYS = 30
const PRIOR_ALPHA = 1
const PRIOR_BETA = 1

const ROLE_SCORE_WEIGHTS: ReadonlyArray<[keyof Omit<RouteRoleSignals, "signalConfidence">, number]> = [
  ["intrinsicInterest", 0.3],
  ["independentRepeatSelection", 0.25],
  ["contiguousLengthQuality", 0.2],
  ["deviationFromFastConnector", 0.15],
  ["explicitPositiveNotes", 0.1]
]

const EVIDENCE_KINDS = new Set<RigEvidenceKind>([
  "desirability",
  "hard-authority",
  "soft-current-report",
  "preference-positive",
  "preference-negative"
])
const ROUTE_ROLES = new Set<RigRouteRole>(["highlight", "supporting", "connector", "unknown"])
const RIG_DIMENSIONS = new Set<string>(RIG_DIMENSION_KEYS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isBoundedNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_IDENTIFIER_LENGTH
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
}

function round(value: number): number {
  return Number(value.toFixed(6))
}

function assertAggregationOption(value: number, name: string, minimum = 0): void {
  if (!Number.isFinite(value) || value <= minimum) throw new Error(`${name} must be greater than ${minimum}`)
}

function halfLifeFor(kind: RigEvidenceKind, options: Required<RigAggregationOptions>): number {
  if (kind === "soft-current-report") return options.softReportHalfLifeDays
  if (kind === "hard-authority") return Number.POSITIVE_INFINITY
  return options.desirabilityHalfLifeDays
}

function freshness(observedAt: string, now: string, halfLifeDays: number): number {
  if (!Number.isFinite(halfLifeDays)) return 1
  const ageDays = Math.max(0, (Date.parse(now) - Date.parse(observedAt)) / 86_400_000)
  return Math.exp(-Math.LN2 * ageDays / halfLifeDays)
}

function channel(kind: RigEvidenceKind): "desirability" | "access" | "soft" | "positive" | "negative" {
  switch (kind) {
    case "desirability": return "desirability"
    case "hard-authority": return "access"
    case "soft-current-report": return "soft"
    case "preference-positive": return "positive"
    case "preference-negative": return "negative"
  }
}

function weightFor(
  observation: RigEvidenceObservation,
  duplicateIndependence: number,
  options: Required<RigAggregationOptions>
): number {
  const roleWeight = observation.kind === "desirability" ? observation.routeRoleWeight : 1
  return RIG_SOURCE_WEIGHTS[observation.source] *
    observation.mapMatchConfidence *
    observation.coveredFraction *
    freshness(observation.observedAt, options.now, halfLifeFor(observation.kind, options)) *
    duplicateIndependence *
    roleWeight
}

function duplicateFactors(observations: readonly RigEvidenceObservation[]): Map<RigEvidenceObservation, number> {
  const families = new Map<string, Set<string>>()
  for (const observation of observations) {
    const key = `${observation.segmentUid}\u0000${observation.contributorId}`
    const familyIds = families.get(key) ?? new Set<string>()
    familyIds.add(observation.duplicateFamilyId)
    families.set(key, familyIds)
  }
  return new Map(observations.map((observation) => {
    const key = `${observation.segmentUid}\u0000${observation.contributorId}`
    const duplicateCount = Math.max(0, (families.get(key)?.size ?? 1) - 1)
    return [observation, 1 / Math.sqrt(1 + duplicateCount)]
  }))
}

function contributorScales(
  weighted: ReadonlyArray<{ observation: RigEvidenceObservation; channel: string; weight: number }>,
  cap: number
): Map<RigEvidenceObservation, number> {
  const totals = new Map<string, number>()
  for (const item of weighted) {
    const key = `${item.observation.segmentUid}\u0000${item.observation.contributorId}\u0000${item.channel}`
    totals.set(key, (totals.get(key) ?? 0) + item.weight)
  }
  return new Map(weighted.map((item) => {
    const key = `${item.observation.segmentUid}\u0000${item.observation.contributorId}\u0000${item.channel}`
    const total = totals.get(key) ?? 0
    return [item.observation, total > cap ? cap / total : 1]
  }))
}

/** Infer role from inspectable signals; middle scores and weak signals stay unknown. */
export function inferRouteRole(signals: RouteRoleSignals): RouteRoleInference {
  for (const [key] of ROLE_SCORE_WEIGHTS) {
    if (!isBoundedNumber(signals[key])) throw new Error(`Route-role signal ${key} must be between 0 and 1`)
  }
  if (!isBoundedNumber(signals.signalConfidence)) throw new Error("Route-role signal confidence must be between 0 and 1")
  const score = ROLE_SCORE_WEIGHTS.reduce((sum, [key, weight]) => sum + signals[key] * weight, 0)
  const role = signals.signalConfidence < 0.5
    ? "unknown"
    : score >= 0.7
      ? "highlight"
      : score >= 0.45
        ? "supporting"
        : score <= 0.3
          ? "connector"
          : "unknown"
  return { role, score: round(score), signalConfidence: signals.signalConfidence }
}

/** Validate untrusted RIG event payloads before they enter an aggregate. */
export function isRigEvidenceObservation(value: unknown): value is RigEvidenceObservation {
  if (!isRecord(value) || !SEGMENT_UID.test(typeof value.segmentUid === "string" ? value.segmentUid : "")) return false
  if (!isIdentifier(value.contributorId) || !isIdentifier(value.duplicateFamilyId)) return false
  if (typeof value.source !== "string" || !Object.hasOwn(RIG_SOURCE_WEIGHTS, value.source) || !EVIDENCE_KINDS.has(value.kind as RigEvidenceKind)) return false
  if (!ROUTE_ROLES.has(value.routeRole as RigRouteRole) || !isBoundedNumber(value.routeRoleWeight)) return false
  if (!isValidDate(value.observedAt) || !isBoundedNumber(value.mapMatchConfidence) || !isBoundedNumber(value.coveredFraction)) return false
  if (value.surfaceConfidence !== undefined && !isBoundedNumber(value.surfaceConfidence)) return false
  if (value.dimensions !== undefined) {
    if (!isRecord(value.dimensions)) return false
    for (const [key, dimension] of Object.entries(value.dimensions)) {
      if (!RIG_DIMENSIONS.has(key) || !isBoundedNumber(dimension)) return false
    }
  }
  return true
}

/** Validate the compact aggregate before a graph/index builder consumes it. */
export function isRigSegmentAggregate(value: unknown): value is RigSegmentAggregate {
  if (!isRecord(value) || !SEGMENT_UID.test(typeof value.segmentUid === "string" ? value.segmentUid : "")) return false
  if (!ROUTE_ROLES.has(value.dominantRole as RigRouteRole) || !isRecord(value.dimensions)) return false
  if (Object.entries(value.dimensions).some(([key, dimension]) => !RIG_DIMENSIONS.has(key) || !isBoundedNumber(dimension))) return false
  const boundedKeys = ["evidenceConfidence", "evidenceStrength", "accessConfidence"]
  if (boundedKeys.some((key) => !isBoundedNumber(value[key]))) return false
  const nonNegativeKeys = ["totalEvidenceWeight", "maxContributorWeight", "surfaceConfidence", "hardAuthorityWeight", "softCurrentReportWeight"]
  if (nonNegativeKeys.some((key) => value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0))) return false
  if (!isNonNegativeInteger(value.independentSourceCount)) return false
  if (!isNonNegativeInteger(value.observationCount)) return false
  if (!isRecord(value.preference) ||
    typeof value.preference.alpha !== "number" || !Number.isFinite(value.preference.alpha) || value.preference.alpha < 1 ||
    typeof value.preference.beta !== "number" || !Number.isFinite(value.preference.beta) || value.preference.beta < 1 ||
    !isBoundedNumber(value.preference.mean)) return false
  return true
}

function requiredOptions(input: RigAggregationOptions): Required<RigAggregationOptions> {
  const options = {
    now: input.now ?? new Date().toISOString(),
    maxObservations: input.maxObservations ?? DEFAULT_MAX_OBSERVATIONS,
    contributorCap: input.contributorCap ?? DEFAULT_CONTRIBUTOR_CAP,
    kappa: input.kappa ?? DEFAULT_KAPPA,
    diversityDelta: input.diversityDelta ?? DEFAULT_DIVERSITY_DELTA,
    desirabilityHalfLifeDays: input.desirabilityHalfLifeDays ?? DEFAULT_DESIRABILITY_HALF_LIFE_DAYS,
    softReportHalfLifeDays: input.softReportHalfLifeDays ?? DEFAULT_SOFT_REPORT_HALF_LIFE_DAYS
  }
  if (!isValidDate(options.now)) throw new Error("RIG aggregation now must be an ISO date")
  if (!Number.isSafeInteger(options.maxObservations) || options.maxObservations <= 0) throw new Error("RIG maximum observations must be positive")
  assertAggregationOption(options.contributorCap, "RIG contributor cap")
  assertAggregationOption(options.kappa, "RIG kappa")
  assertAggregationOption(options.diversityDelta, "RIG diversity delta")
  assertAggregationOption(options.desirabilityHalfLifeDays, "RIG desirability half-life")
  assertAggregationOption(options.softReportHalfLifeDays, "RIG soft-report half-life")
  return options
}

/** Aggregate bounded evidence without storing route geometry or contributor lists. */
export function aggregateRigEvidence(
  input: readonly unknown[],
  inputOptions: RigAggregationOptions = {}
): RigSegmentAggregate[] {
  const options = requiredOptions(inputOptions)
  if (input.length > options.maxObservations) throw new Error("RIG evidence batch exceeds the maximum observation count")
  const observations = input.map((value) => {
    if (!isRigEvidenceObservation(value)) throw new Error("RIG evidence observation is invalid")
    return value
  })
  const duplicateFactor = duplicateFactors(observations)
  const weighted = observations.map((observation) => ({
    observation,
    channel: channel(observation.kind),
    weight: weightFor(observation, duplicateFactor.get(observation) ?? 1, options)
  }))
  const scales = contributorScales(weighted, options.contributorCap)
  const bySegment = new Map<string, typeof weighted>()
  for (const item of weighted) {
    const segmentItems = bySegment.get(item.observation.segmentUid) ?? []
    segmentItems.push(item)
    bySegment.set(item.observation.segmentUid, segmentItems)
  }

  return [...bySegment.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([segmentUid, items]) => {
    const dimensions: Partial<Record<RigDimensionKey, number>> = {}
    const dimensionTotals = new Map<RigDimensionKey, { weight: number; value: number }>()
    const roleTotals = new Map<RigRouteRole, number>()
    let totalEvidenceWeight = 0
    let hardAuthorityWeight = 0
    let softCurrentReportWeight = 0
    let positiveWeight = 0
    let negativeWeight = 0
    let surfaceWeight = 0
    let surfaceValue = 0
    let maxContributorWeight = 0
    const independentSources = new Set<string>()
    const contributorTotals = new Map<string, number>()

    for (const item of items) {
      const contribution = item.weight * (scales.get(item.observation) ?? 1)
      if (contribution <= 0) continue
      const observation = item.observation
      const contributorKey = `${observation.contributorId}\u0000${item.channel}`
      contributorTotals.set(contributorKey, (contributorTotals.get(contributorKey) ?? 0) + contribution)
      if (item.channel === "desirability") {
        totalEvidenceWeight += contribution
        independentSources.add(observation.contributorId)
        roleTotals.set(observation.routeRole, (roleTotals.get(observation.routeRole) ?? 0) + contribution)
        for (const [key, value] of Object.entries(observation.dimensions ?? {}) as [RigDimensionKey, number][]) {
          const current = dimensionTotals.get(key) ?? { weight: 0, value: 0 }
          current.weight += contribution
          current.value += contribution * value
          dimensionTotals.set(key, current)
        }
        if (observation.surfaceConfidence !== undefined) {
          surfaceWeight += contribution
          surfaceValue += contribution * observation.surfaceConfidence
        }
      } else if (item.channel === "access") {
        hardAuthorityWeight += contribution
      } else if (item.channel === "soft") {
        softCurrentReportWeight += contribution
      } else if (item.channel === "positive") {
        positiveWeight += contribution
      } else {
        negativeWeight += contribution
      }
    }

    for (const [key, values] of dimensionTotals) dimensions[key] = round(values.value / values.weight)
    maxContributorWeight = Math.max(...contributorTotals.values(), 0)
    const evidenceConfidence = 1 - Math.exp(-totalEvidenceWeight / options.kappa)
    const independentDiversity = 1 - Math.exp(-independentSources.size / options.diversityDelta)
    const dominantRole = [...roleTotals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "unknown"
    const alpha = PRIOR_ALPHA + positiveWeight
    const beta = PRIOR_BETA + negativeWeight
    return {
      segmentUid,
      dominantRole,
      dimensions,
      totalEvidenceWeight: round(totalEvidenceWeight),
      evidenceConfidence: round(evidenceConfidence),
      evidenceStrength: round(evidenceConfidence * (0.5 + 0.5 * independentDiversity)),
      independentSourceCount: independentSources.size,
      maxContributorWeight: round(maxContributorWeight),
      accessConfidence: round(1 - Math.exp(-hardAuthorityWeight / options.kappa)),
      ...(surfaceWeight > 0 ? { surfaceConfidence: round(surfaceValue / surfaceWeight) } : {}),
      hardAuthorityWeight: round(hardAuthorityWeight),
      softCurrentReportWeight: round(softCurrentReportWeight),
      preference: { alpha: round(alpha), beta: round(beta), mean: round(alpha / (alpha + beta)) },
      observationCount: items.length
    }
  })
}
