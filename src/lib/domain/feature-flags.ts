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
   * Graph-matched road requirements (SB-006/SB-013).
   *
   * Until the graph-matching endpoint ships, manual road locks carry no edge
   * IDs and cannot be honored honestly:
   * - Must-mode priority-zero rules are DISABLED (they trapped the whole
   *   route inside a thin buffered corridor).
   * - Manual locks with no graph evidence never reach the provider model.
   * - The UI labels the feature experimental and disables "Must use".
   */
  roadRequirements: false,

  /**
   * Free Ride suggestions (SB-012/SB-029).
   *
   * The current endpoint synthesizes road class, scenic, traffic, novelty,
   * and legal-access values. Until it is graph-backed and directional it
   * stays Experimental: labeled in the UI, no safety/verification claims.
   */
  freeRideSuggestions: true,

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
