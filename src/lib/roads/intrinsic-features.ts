export const INTRINSIC_FEATURE_KEYS = [
  "surface",
  "access",
  "curvature",
  "elevation",
  "flow",
  "mvum"
] as const

export type IntrinsicFeatureKey = typeof INTRINSIC_FEATURE_KEYS[number]
export type FeatureCoverage = "complete" | "partial" | "unknown"

export interface IntrinsicFeatureProvenance {
  source: string
  dataset?: string
  version?: string
  observedAt?: string
  coverage: FeatureCoverage
  limitations: string[]
}

export type IntrinsicFeatureProvenanceMap = Partial<Record<IntrinsicFeatureKey, IntrinsicFeatureProvenance>>

const COVERAGE_SCORE: Record<FeatureCoverage, number> = {
  complete: 1,
  partial: 0.5,
  unknown: 0
}

export function unknownFeatureProvenance(limitation: string): IntrinsicFeatureProvenance {
  return {
    source: "unavailable",
    coverage: "unknown",
    limitations: [limitation]
  }
}

/** Coverage is measured field availability, not a calibrated quality probability. */
export function intrinsicFeatureCoverage(provenance: IntrinsicFeatureProvenanceMap): number {
  const total = INTRINSIC_FEATURE_KEYS.reduce(
    (sum, key) => sum + COVERAGE_SCORE[provenance[key]?.coverage ?? "unknown"],
    0
  )
  return Number((total / INTRINSIC_FEATURE_KEYS.length).toFixed(3))
}

export function isIntrinsicFeatureProvenance(value: unknown): value is IntrinsicFeatureProvenance {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<IntrinsicFeatureProvenance>
  return typeof candidate.source === "string" && candidate.source.trim().length > 0 &&
    (candidate.coverage === "complete" || candidate.coverage === "partial" || candidate.coverage === "unknown") &&
    Array.isArray(candidate.limitations) && candidate.limitations.every((item) => typeof item === "string") &&
    (candidate.dataset === undefined || typeof candidate.dataset === "string") &&
    (candidate.version === undefined || typeof candidate.version === "string") &&
    (candidate.observedAt === undefined || (typeof candidate.observedAt === "string" && Number.isFinite(Date.parse(candidate.observedAt))))
}

export function isIntrinsicFeatureProvenanceMap(value: unknown): value is IntrinsicFeatureProvenanceMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.entries(value as Record<string, unknown>).every(([key, item]) =>
    (INTRINSIC_FEATURE_KEYS as readonly string[]).includes(key) && isIntrinsicFeatureProvenance(item)
  )
}
