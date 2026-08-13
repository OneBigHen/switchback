/**
 * Central feature flags for the recovery program (Phase 0 containment).
 *
 * Each flag has an honest default: surfaces whose domain behavior is not yet
 * trustworthy are either disabled (so they cannot influence routing or
 * mislabel output) or labeled Experimental. Flip a flag only when the
 * corresponding phase's acceptance tests pass.
 *
 * Mutable so tests can exercise the enabled path; production defaults keep
 * untrusted behavior disabled.
 */
export const featureFlags = {
  /**
   * Graph-matched road requirements (SB-006/SB-013/SB-014/SB-015).
   *
   * - Manual locks are graph-matched against the live router before saving
   *   (SB-013); a refusal falls back to an approximate lock that never claims
   *   an exact match.
   * - Must-use locks force ordered traversal via injected via-waypoints at
   *   their entry/exit anchors (SB-014) and reward the corridor — never a
   *   global outside zero that traps the route inside a thin buffer.
   * - Prefer locks apply a bounded inside-corridor reward (SB-015) without
   *   penalizing unrelated route sections.
   */
  roadRequirements: true,

  /**
   * Personalized / neural ranking (SB-033).
   *
   * May only re-rank ELIGIBLE candidates and must never silently replace an
   * explicit user selection. The "neural" top-level profile is treated as a
   * personalization policy over eligible candidates, not a separate engine.
   */
  neuralRanking: true
}

export type FeatureFlagName = keyof typeof featureFlags

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return featureFlags[name]
}
