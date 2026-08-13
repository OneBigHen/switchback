import { calculateGeometryOverlap } from "@/lib/routing/scoring"
import type { CanonicalRouteSegmentRef, Coordinate } from "@/lib/routing/types"
import { PA_NJ_ROUTE_POLICY_V1 } from "./route-policy"

export type SimilarityMode = "canonical-directed" | "geometry-proxy" | "unknown"

export interface DiversityRoute {
  id: string
  geometry: Coordinate[]
  routeScore?: { total: number; accepted?: boolean }
  canonicalSegmentRefs?: CanonicalRouteSegmentRef[]
}

export interface RouteSimilarity {
  mode: SimilarityMode
  overlapShare: number
  weightedJaccard: number
}

export interface MmrCandidate<T extends DiversityRoute> {
  route: T
  mmrScore: number
  maxSimilarity: number
  similarityMode: SimilarityMode
}

export interface MmrOptions<T extends DiversityRoute> {
  diversityLambda?: number
  maxSimilarity?: number
  strict?: boolean
  utility?: (route: T) => number
}

function validRefs(refs: CanonicalRouteSegmentRef[] | undefined): refs is CanonicalRouteSegmentRef[] {
  if (!refs || refs.length === 0) return false
  const seen = new Set<string>()
  return refs.every((ref) => {
    if (!/^[a-f0-9]{64}$/.test(ref.canonicalSegmentUid)) return false
    if (!Number.isFinite(ref.lengthMeters) || ref.lengthMeters <= 0 || seen.has(ref.canonicalSegmentUid)) return false
    seen.add(ref.canonicalSegmentUid)
    return true
  })
}

function refsByUid(refs: CanonicalRouteSegmentRef[]): Map<string, number> {
  return new Map(refs.map((ref) => [ref.canonicalSegmentUid, ref.lengthMeters]))
}

/** Compare directed canonical refs, falling back without claiming segment truth. */
export function routeSimilarity(first: DiversityRoute, second: DiversityRoute): RouteSimilarity {
  if (validRefs(first.canonicalSegmentRefs) && validRefs(second.canonicalSegmentRefs)) {
    const left = refsByUid(first.canonicalSegmentRefs)
    const right = refsByUid(second.canonicalSegmentRefs)
    const totalLeft = [...left.values()].reduce((sum, value) => sum + value, 0)
    const totalRight = [...right.values()].reduce((sum, value) => sum + value, 0)
    const shared = [...left.entries()].reduce(
      (sum, [uid, length]) => sum + Math.min(length, right.get(uid) ?? 0),
      0
    )
    const denominator = totalLeft + totalRight - shared
    return {
      mode: "canonical-directed",
      overlapShare: Math.max(0, Math.min(1, shared / Math.max(1, Math.min(totalLeft, totalRight)))),
      weightedJaccard: Math.max(0, Math.min(1, shared / Math.max(1, denominator)))
    }
  }
  if (first.geometry.length >= 2 && second.geometry.length >= 2) {
    const overlapShare = calculateGeometryOverlap(first.geometry, second.geometry) / 100
    return { mode: "geometry-proxy", overlapShare, weightedJaccard: overlapShare }
  }
  return { mode: "unknown", overlapShare: 0, weightedJaccard: 0 }
}

function normalizedUtilities<T extends DiversityRoute>(
  routes: readonly T[],
  utility: (route: T) => number
): Map<string, number> {
  const values = routes.map((route) => Number.isFinite(utility(route)) ? utility(route) : 0)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const span = maximum - minimum
  const scoreScale = values.every((value) => value >= 0 && value <= 100)
  return new Map(routes.map((route, index) => [
    route.id,
    scoreScale
      ? Math.max(0, Math.min(1, values[index]! / 100))
      : span > 0 ? (values[index]! - minimum) / span : 1
  ]))
}

/** Rank eligible candidates with bounded MMR against already selected routes. */
export function rankDiverseCandidates<T extends DiversityRoute>(
  candidates: readonly T[],
  selected: readonly DiversityRoute[],
  inputOptions: MmrOptions<T> = {}
): MmrCandidate<T>[] {
  const lambda = inputOptions.diversityLambda ?? PA_NJ_ROUTE_POLICY_V1.diversityLambda
  const maxSimilarity = inputOptions.maxSimilarity ?? PA_NJ_ROUTE_POLICY_V1.duplicateSimilarityThreshold
  if (!Number.isFinite(lambda) || lambda < 0 || lambda > 1) throw new Error("MMR diversity lambda must be between 0 and 1")
  if (!Number.isFinite(maxSimilarity) || maxSimilarity < 0 || maxSimilarity > 1) throw new Error("MMR maximum similarity must be between 0 and 1")
  const eligible = candidates.filter((route) => route.routeScore?.accepted !== false)
  const utility = inputOptions.utility ?? ((route) => route.routeScore?.total ?? 50)
  const normalized = normalizedUtilities(eligible, utility)
  return eligible
    .map((route, index) => {
      const similarities = selected.map((current) => routeSimilarity(route, current))
      const maximum = similarities.reduce((best, similarity) => Math.max(best, similarity.overlapShare), 0)
      const similarityMode = similarities.find((similarity) => similarity.overlapShare === maximum)?.mode ?? "unknown"
      const mmrScore = (normalized.get(route.id) ?? 0) - lambda * maximum
      return { route, mmrScore, maxSimilarity: maximum, similarityMode, index }
    })
    .filter((candidate) => !inputOptions.strict || candidate.maxSimilarity <= maxSimilarity)
    .sort((left, right) => right.mmrScore - left.mmrScore || left.maxSimilarity - right.maxSimilarity || left.index - right.index)
    .map(({ route, mmrScore, maxSimilarity, similarityMode }) => ({
      route,
      mmrScore,
      maxSimilarity,
      similarityMode
    }))
}
