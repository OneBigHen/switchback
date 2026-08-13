import type { RoadSegmentFeature, RideProfile } from "@/lib/domain/contracts"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import {
  disallowedSmoothness,
  disallowedSurfaces,
  disallowedTracktypes
} from "@/lib/routing/bike-profiles"
import { isIntrinsicFeatureProvenanceMap } from "@/lib/roads/intrinsic-features"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"
import type { RoadLockSatisfaction } from "@/lib/roads/road-locks"

/**
 * Route eligibility (SB-002): hard rules that a route either passes or fails.
 *
 * Eligibility is separate from ranking. A failed candidate is NEVER converted
 * into a ranking penalty, selected "because it is closest", or described as
 * safe. The planner returns an eligible baseline instead.
 */

export type EligibilityFailureCode =
  | "invalid-geometry"
  | "preview-only"
  | "must-road-unresolved"
  | "illegal-access"
  | "active-closure"
  | "bike-incompatible"
  | "surface-incompatible"
  | "low-coverage"
  | "invalid-feature-data"
  | "no-feature-data"
  | "blocking-safety"
  | "outside-coverage"

export interface EligibilityFailure {
  code: EligibilityFailureCode
  message: string
  segmentId?: string
}

export type EligibilityWarningCode =
  | "unknown-access"
  | "unknown-closure"
  | "unknown-surface"
  | "unknown-coverage"
  | "discouraged-access"
  | "discouraged-profile"
  | "soft-current-report"

export interface EligibilityWarning {
  code: EligibilityWarningCode
  message: string
  segmentId?: string
}

export interface RouteEligibility {
  eligible: boolean
  failures: EligibilityFailure[]
  warnings: EligibilityWarning[]
}

export interface FeatureEligibilityRoute {
  geometry: Coordinate[]
  confidence: number
  segments: readonly RoadSegmentFeature[]
}

export interface FeatureEligibilityOptions {
  profile?: RideProfile
  bikeProfile?: BikeProfile
  /** Coverage is a measured availability floor, not a quality probability. */
  minimumCoverage?: number
}

const DEFAULT_MINIMUM_COVERAGE = 0.25
const BLOCKING_FLAGS = /(?:private|illegal|closure|closed|unsafe|invalid|impassable)/i

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 &&
    isFiniteNumber(value[0]) && isFiniteNumber(value[1]) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T)
}

function setHas<T extends string>(values: ReadonlySet<T>, value: string | undefined): boolean {
  return value !== undefined && values.has(value as T)
}

/** Runtime guard for feature data arriving from a matcher/worker boundary. */
export function isRoadSegmentFeature(value: unknown): value is RoadSegmentFeature {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  const profiles = candidate.profileCompatibility
  const profileCompatibilityValid = profiles === undefined || (
    typeof profiles === "object" && profiles !== null && !Array.isArray(profiles) &&
    Object.values(profiles).every((item) => item === "compatible" || item === "discouraged" || item === "incompatible")
  )
  const optionalStrings = [
    "canonicalSegmentUid", "roadClass", "surface", "smoothness", "trackType"
  ]
  const optionalNumbers = [
    "speedLimitKph", "laneCount", "elevationGainMeters", "elevationLossMeters",
    "elevationInterest", "proximityToWater", "proximityToPark", "proximityToMountain",
    "trafficPenalty", "signalDensity", "stopDensity", "intersectionDensity",
    "urbanDensityPenalty", "highwayPenalty", "incidentPenalty", "gravelSuitability",
    "familiarity", "novelty"
  ]
  return typeof candidate.segmentId === "string" && candidate.segmentId.length > 0 &&
    Array.isArray(candidate.geometry) && candidate.geometry.length >= 2 && candidate.geometry.every(isCoordinate) &&
    isFiniteNumber(candidate.curvature) && isFiniteNumber(candidate.curveDensity) &&
    isFiniteNumber(candidate.curveSeverity) && isFiniteNumber(candidate.headingChangePerKilometer) &&
    isFiniteNumber(candidate.scenicProxy) &&
    isEnum(candidate.legalAccess, ["permitted", "designated", "discouraged", "private", "forbidden", "unknown"] as const) &&
    isEnum(candidate.seasonalAccess, ["open", "conditional", "closed", "unknown"] as const) &&
    Array.isArray(candidate.safetyFlags) && candidate.safetyFlags.every((item) => typeof item === "string") &&
    (candidate.softCurrentReports === undefined || (
      Array.isArray(candidate.softCurrentReports) && candidate.softCurrentReports.every((item) => typeof item === "string")
    )) &&
    isFiniteNumber(candidate.distanceMeters) && candidate.distanceMeters >= 0 &&
    optionalStrings.every((key) => candidate[key] === undefined || typeof candidate[key] === "string") &&
    optionalNumbers.every((key) => candidate[key] === undefined || isFiniteNumber(candidate[key])) &&
    (candidate.featureProvenance === undefined || isIntrinsicFeatureProvenanceMap(candidate.featureProvenance)) &&
    (candidate.dataConfidence === undefined || (
      isFiniteNumber(candidate.dataConfidence) && candidate.dataConfidence >= 0 && candidate.dataConfidence <= 1
    )) && profileCompatibilityValid
}

function featureFailure(
  code: EligibilityFailureCode,
  message: string,
  segmentId?: string
): EligibilityFailure {
  return { code, message, ...(segmentId ? { segmentId } : {}) }
}

function featureWarning(
  code: EligibilityWarningCode,
  message: string,
  segmentId?: string
): EligibilityWarning {
  return { code, message, ...(segmentId ? { segmentId } : {}) }
}

/**
 * Apply segment legality, closure, bike, surface, and coverage gates before
 * any utility is calculated. Unknown mapped facts warn; they never become a
 * fabricated permission or rejection.
 */
export function evaluateFeatureEligibility(
  route: FeatureEligibilityRoute,
  options: FeatureEligibilityOptions = {}
): RouteEligibility {
  const failures: EligibilityFailure[] = []
  const warnings: EligibilityWarning[] = []
  const minimumCoverage = Number.isFinite(options.minimumCoverage) &&
    options.minimumCoverage! >= 0 && options.minimumCoverage! <= 1
    ? options.minimumCoverage!
    : DEFAULT_MINIMUM_COVERAGE
  const geometry = Array.isArray(route.geometry) ? route.geometry : []
  const segments = Array.isArray(route.segments) ? route.segments : []

  if (geometry.length < 2 || !geometry.every(isCoordinate)) {
    failures.push(featureFailure("invalid-geometry", "This route has no usable geometry."))
  }
  if (!isFiniteNumber(route.confidence) || route.confidence < minimumCoverage) {
    failures.push(featureFailure("low-coverage", "Routing confidence is too low for a recommendation."))
  }
  if (!Array.isArray(route.segments)) {
    failures.push(featureFailure("invalid-feature-data", "The route contains malformed road-feature data."))
    return { eligible: false, failures, warnings }
  }
  if (segments.length === 0) {
    failures.push(featureFailure("no-feature-data", "The route has no road-feature data."))
    return { eligible: false, failures, warnings }
  }
  if (!segments.every(isRoadSegmentFeature)) {
    failures.push(featureFailure("invalid-feature-data", "The route contains malformed road-feature data."))
    return { eligible: false, failures, warnings }
  }

  for (const segment of segments) {
    const segmentId = segment.segmentId
    if (segment.legalAccess === "private" || segment.legalAccess === "forbidden") {
      failures.push(featureFailure("illegal-access", `Road segment ${segmentId} has no legal motorcycle access.`, segmentId))
    } else if (segment.legalAccess === "unknown") {
      warnings.push(featureWarning("unknown-access", `Road segment ${segmentId} has unknown legal access.`, segmentId))
    } else if (segment.legalAccess === "discouraged") {
      warnings.push(featureWarning("discouraged-access", `Road segment ${segmentId} is discouraged by mapped access evidence.`, segmentId))
    }

    if (segment.seasonalAccess === "closed") {
      failures.push(featureFailure("active-closure", `Road segment ${segmentId} is closed.`, segmentId))
    } else if (segment.seasonalAccess === "unknown") {
      warnings.push(featureWarning("unknown-closure", `Road segment ${segmentId} has unknown current closure status.`, segmentId))
    }

    const compatibility = options.profile ? segment.profileCompatibility?.[options.profile] : undefined
    if (compatibility === "incompatible") {
      failures.push(featureFailure("bike-incompatible", `Road segment ${segmentId} is incompatible with the selected motorcycle profile.`, segmentId))
    } else if (compatibility === "discouraged") {
      warnings.push(featureWarning("discouraged-profile", `Road segment ${segmentId} is discouraged for the selected motorcycle profile.`, segmentId))
    }

    if (options.bikeProfile) {
      const surfaces = disallowedSurfaces(options.bikeProfile)
      const smoothness = disallowedSmoothness(options.bikeProfile)
      const tracktypes = disallowedTracktypes(options.bikeProfile)
      if (setHas(surfaces, segment.surface) || (
        (options.bikeProfile.category === "street" || options.bikeProfile.category === "touring") &&
        segment.surface === "unpaved" && !options.bikeProfile.allowMaintainedGravel
      )) {
        failures.push(featureFailure("surface-incompatible", `Road segment ${segmentId} uses surface ${segment.surface}, which is incompatible with the ${options.bikeProfile.name} profile.`, segmentId))
      }
      if (setHas(smoothness, segment.smoothness)) {
        failures.push(featureFailure("surface-incompatible", `Road segment ${segmentId} has ${segment.smoothness} smoothness, which is incompatible with the ${options.bikeProfile.name} profile.`, segmentId))
      }
      if (setHas(tracktypes, segment.trackType)) {
        failures.push(featureFailure("surface-incompatible", `Road segment ${segmentId} has track type ${segment.trackType}, which is incompatible with the ${options.bikeProfile.name} profile.`, segmentId))
      }
    }
    if (segment.surface === undefined || segment.surface === "unknown") {
      warnings.push(featureWarning("unknown-surface", `Road segment ${segmentId} has unknown surface evidence.`, segmentId))
    }

    if (segment.dataConfidence !== undefined && segment.dataConfidence < minimumCoverage) {
      failures.push(featureFailure("low-coverage", `Road segment ${segmentId} has low-confidence data.`, segmentId))
    } else if (segment.dataConfidence === undefined) {
      warnings.push(featureWarning("unknown-coverage", `Road segment ${segmentId} has unknown feature coverage.`, segmentId))
    }

    for (const flag of segment.safetyFlags) {
      if (BLOCKING_FLAGS.test(flag)) {
        failures.push(featureFailure("blocking-safety", `Road segment ${segmentId} has a blocking safety or access flag.`, segmentId))
        break
      }
    }
    if (segment.softCurrentReports && segment.softCurrentReports.length > 0) {
      warnings.push(featureWarning("soft-current-report", `Road segment ${segmentId} has a current rider report requiring verification.`, segmentId))
    }
  }

  return { eligible: failures.length === 0, failures, warnings }
}

/** A guidance route must have real traversable geometry. */
function geometryFailure(route: PlannedRoute): EligibilityFailure | null {
  if (!route.geometry || route.geometry.length < 2) {
    return {
      code: "invalid-geometry",
      message: "This route has no usable geometry."
    }
  }
  return null
}

/**
 * Preview-only geometry (e.g. a sketched line never routed through the
 * provider) must never be used for guidance or offered as a rideable route.
 */
function previewFailure(route: PlannedRoute): EligibilityFailure | null {
  if (route.previewOnly) {
    return {
      code: "preview-only",
      message: "This is a sketched line, not a routed route. Plan it before riding."
    }
  }
  return null
}

/**
 * A `must` road requirement that the route does not traverse makes the route
 * ineligible for this rider — it is not a soft preference to be traded off
 * against duration (SB-006/SB-014).
 */
function mustRoadFailure(route: PlannedRoute): EligibilityFailure | null {
  const unsatisfied = (route.lockSatisfaction ?? []).find((row: RoadLockSatisfaction) =>
    row.mode === "must" && !row.satisfied
  )
  if (unsatisfied) {
    return {
      code: "must-road-unresolved",
      message: unsatisfied.match.kind === "unresolved"
        ? unsatisfied.match.reason
        : "A required road could not be traversed on this route."
    }
  }
  return null
}

/**
 * Evaluate hard eligibility for a candidate route. Hard rules that depend
 * only on the route are applied today; provider/coverage context is a future
 * extension point.
 */
export function evaluateEligibility(route: PlannedRoute): RouteEligibility {
  const failures = [
    geometryFailure(route),
    previewFailure(route),
    mustRoadFailure(route)
  ].filter((failure): failure is EligibilityFailure => failure !== null)
  return {
    eligible: failures.length === 0,
    failures,
    warnings: []
  }
}

export function isEligible(route: PlannedRoute): boolean {
  return evaluateEligibility(route).eligible
}
