import type { RideProfile } from "@/lib/domain/contracts"

export interface RouteProfileWeights {
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

export interface RoutePolicy {
  version: string
  territory: "pa-nj"
  preferredDetourPct: number
  diversityLambda: number
  duplicateSimilarityThreshold: number
  maxAlternatives: number
  profileWeights: Readonly<Record<RideProfile, RouteProfileWeights>>
}

/** Frozen v1 PA/NJ ranking policy; changes require a new version and corpus run. */
export const PA_NJ_ROUTE_POLICY_V1: RoutePolicy = Object.freeze({
  version: "pa-nj-route-policy-v1",
  territory: "pa-nj",
  preferredDetourPct: 0.08,
  diversityLambda: 0.35,
  duplicateSimilarityThreshold: 0.85,
  maxAlternatives: 2,
  profileWeights: {
    quick: { twistiness: 0.05, scenic: 0.05, elevation: 0.02, gravel: 0, traffic: 0.2, simplicity: 0.18, novelty: 0.02, safety: 0.2, confidence: 0.12, eta: 0.16 },
    balanced: { twistiness: 0.14, scenic: 0.12, elevation: 0.08, gravel: 0.03, traffic: 0.14, simplicity: 0.13, novelty: 0.06, safety: 0.16, confidence: 0.1, eta: 0.04 },
    twisty: { twistiness: 0.28, scenic: 0.1, elevation: 0.08, gravel: 0.03, traffic: 0.12, simplicity: 0.05, novelty: 0.1, safety: 0.12, confidence: 0.08, eta: 0.04 },
    scenic: { twistiness: 0.12, scenic: 0.24, elevation: 0.12, gravel: 0.04, traffic: 0.12, simplicity: 0.07, novelty: 0.1, safety: 0.1, confidence: 0.07, eta: 0.02 },
    adventure: { twistiness: 0.12, scenic: 0.1, elevation: 0.16, gravel: 0.22, traffic: 0.08, simplicity: 0.04, novelty: 0.1, safety: 0.1, confidence: 0.06, eta: 0.02 },
    gravel: { twistiness: 0.08, scenic: 0.08, elevation: 0.12, gravel: 0.32, traffic: 0.08, simplicity: 0.04, novelty: 0.12, safety: 0.09, confidence: 0.05, eta: 0.02 },
    "avoid-highways": { twistiness: 0.18, scenic: 0.16, elevation: 0.08, gravel: 0.04, traffic: 0.14, simplicity: 0.06, novelty: 0.08, safety: 0.12, confidence: 0.1, eta: 0.04 },
    neural: { twistiness: 0.16, scenic: 0.14, elevation: 0.1, gravel: 0.08, traffic: 0.12, simplicity: 0.08, novelty: 0.12, safety: 0.1, confidence: 0.08, eta: 0.02 }
  }
})

export function isRoutePolicy(value: unknown): value is RoutePolicy {
  if (!value || typeof value !== "object") return false
  const policy = value as RoutePolicy
  return typeof policy.version === "string" && policy.version.length > 0 &&
    policy.territory === "pa-nj" &&
    Number.isFinite(policy.preferredDetourPct) && policy.preferredDetourPct >= 0 && policy.preferredDetourPct <= 1 &&
    Number.isFinite(policy.diversityLambda) && policy.diversityLambda >= 0 && policy.diversityLambda <= 1 &&
    Number.isFinite(policy.duplicateSimilarityThreshold) && policy.duplicateSimilarityThreshold >= 0 && policy.duplicateSimilarityThreshold <= 1 &&
    Number.isInteger(policy.maxAlternatives) && policy.maxAlternatives > 0 && policy.maxAlternatives <= 3 &&
    Object.keys(PA_NJ_ROUTE_POLICY_V1.profileWeights).every((profile) => {
      const weights = policy.profileWeights?.[profile as RideProfile]
      return weights !== undefined && Object.values(weights).every((weight) => Number.isFinite(weight) && weight >= 0)
    })
}
