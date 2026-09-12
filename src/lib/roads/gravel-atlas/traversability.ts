/**
 * End-to-end traversability verification for retained atlas corridors.
 *
 * The canonical exporter proves, per OSM segment, that a corridor is built from
 * motorcycle-routable ways. That is a per-segment claim: it does not prove a
 * rider can actually ride the corridor end to end in the built GraphHopper
 * graph, where snapping, subnetwork handling and profile weighting all act on
 * the whole chain. The live verification therefore requires a returned route
 * that stays close, directionally aligned and substantially contiguous with the
 * verified corridor, without an implausible detour.
 */

export interface CorridorTraversalProbe {
  /** Metres from each corridor endpoint to the nearest routable edge, null when unsnappable. */
  endpointSnapMeters: readonly [number | null, number | null]
  /** Metres of the route GraphHopper returns between the corridor endpoints, null when it returns no path. */
  routeMeters: number | null
  /** Fraction (0..1) of corridor samples that match the returned route within radius and direction tolerance. */
  corridorCoveredByRoute: number | null
  /** Largest contiguous run of matching samples, expressed as a fraction (0..1) of the corridor. */
  longestContinuousCoveredFraction: number | null
  /** Share (0..1) of proximity hits whose local route direction agrees with the corridor direction. */
  directionAgreementFraction: number | null
}

export interface TraversabilityThresholds {
  /** Corridor/route coincidence tolerance, shared with runtime route evidence. */
  matchRadiusMeters: number
  /** How far a corridor endpoint may sit from the routable network before it is off-network. */
  maxEndpointSnapMeters: number
  /** Minimum share of the corridor the returned route must follow to count as traversal. */
  minCoveredFraction: number
  /** Minimum single continuous share of the corridor that must be traversed. */
  minContinuousCoveredFraction: number
  /** Minimum directional agreement among route/corridor proximity hits. */
  minDirectionAgreementFraction: number
  /** Maximum endpoint-to-endpoint route distance divided by corridor distance. */
  maxDetourRatio: number
}

/**
 * Evidence-contract identity for the live end-to-end verification gate.
 * Increment whenever any acceptance semantic changes so previously generated
 * Atlas artifacts cannot silently pass under newer routing assumptions.
 *
 * v1 was the original permissive proximity/coverage gate. v2 is the hardened
 * 20 m / 80% gate with continuity, direction and detour requirements.
 */
export const GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION = 2

export const DEFAULT_TRAVERSABILITY_THRESHOLDS: TraversabilityThresholds = {
  matchRadiusMeters: 20,
  maxEndpointSnapMeters: 60,
  minCoveredFraction: 0.8,
  minContinuousCoveredFraction: 0.6,
  minDirectionAgreementFraction: 0.85,
  maxDetourRatio: 1.5
}

export type TraversabilityFailureReason =
  | "no-route"
  | "endpoint-off-network"
  | "route-diverges"

export interface TraversabilityMetrics {
  corridorMeters: number
  routeMeters: number | null
  detourRatio: number | null
  corridorCoveredByRoute: number | null
  longestContinuousCoveredFraction: number | null
  directionAgreementFraction: number | null
  endpointSnapMeters: readonly [number | null, number | null]
}

export type TraversabilityVerdict =
  | { traversable: true; metrics: TraversabilityMetrics }
  | { traversable: false; reason: TraversabilityFailureReason; message: string; metrics: TraversabilityMetrics }

function metricsFor(corridorMeters: number, probe: CorridorTraversalProbe): TraversabilityMetrics {
  return {
    corridorMeters,
    routeMeters: probe.routeMeters,
    detourRatio: probe.routeMeters === null || corridorMeters <= 0
      ? null
      : Number((probe.routeMeters / corridorMeters).toFixed(3)),
    corridorCoveredByRoute: probe.corridorCoveredByRoute,
    longestContinuousCoveredFraction: probe.longestContinuousCoveredFraction,
    directionAgreementFraction: probe.directionAgreementFraction,
    endpointSnapMeters: probe.endpointSnapMeters
  }
}

function validFraction(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 1
}

/**
 * Decide whether a corridor is traversable in the built graph. Fails closed:
 * anything that cannot be positively demonstrated as traversable is refused.
 */
export function evaluateCorridorTraversability(
  corridorMeters: number,
  probe: CorridorTraversalProbe,
  thresholds: TraversabilityThresholds = DEFAULT_TRAVERSABILITY_THRESHOLDS
): TraversabilityVerdict {
  const metrics = metricsFor(corridorMeters, probe)
  if (!Number.isFinite(corridorMeters) || corridorMeters <= 0) {
    return { traversable: false, reason: "no-route", message: "Corridor has no measurable length", metrics }
  }
  if (
    probe.routeMeters === null ||
    !validFraction(probe.corridorCoveredByRoute) ||
    !validFraction(probe.longestContinuousCoveredFraction) ||
    !validFraction(probe.directionAgreementFraction)
  ) {
    return { traversable: false, reason: "no-route", message: "GraphHopper did not return complete traversal evidence", metrics }
  }
  if (!Number.isFinite(probe.routeMeters) || probe.routeMeters <= 0) {
    return { traversable: false, reason: "no-route", message: "GraphHopper returned a degenerate route along the corridor", metrics }
  }
  const snaps = probe.endpointSnapMeters
  if (snaps.some((value) => value === null || !Number.isFinite(value))) {
    return { traversable: false, reason: "no-route", message: "Corridor endpoint could not be snapped to the routable network", metrics }
  }
  const worstSnap = Math.max(snaps[0] as number, snaps[1] as number)
  if (worstSnap > thresholds.maxEndpointSnapMeters) {
    return {
      traversable: false,
      reason: "endpoint-off-network",
      message: `Corridor endpoint is ${Math.round(worstSnap)}m from the routable network (limit ${thresholds.maxEndpointSnapMeters}m)`,
      metrics
    }
  }
  if (metrics.detourRatio === null || metrics.detourRatio > thresholds.maxDetourRatio) {
    return {
      traversable: false,
      reason: "route-diverges",
      message: `Route detour ratio is ${metrics.detourRatio ?? "unknown"} (maximum ${thresholds.maxDetourRatio})`,
      metrics
    }
  }
  if (probe.corridorCoveredByRoute < thresholds.minCoveredFraction) {
    return {
      traversable: false,
      reason: "route-diverges",
      message: `Route follows ${(probe.corridorCoveredByRoute * 100).toFixed(2)}% of the corridor (minimum ${(thresholds.minCoveredFraction * 100).toFixed(0)}%)`,
      metrics
    }
  }
  if (probe.longestContinuousCoveredFraction < thresholds.minContinuousCoveredFraction) {
    return {
      traversable: false,
      reason: "route-diverges",
      message: `Longest continuous traversal is ${(probe.longestContinuousCoveredFraction * 100).toFixed(2)}% of the corridor (minimum ${(thresholds.minContinuousCoveredFraction * 100).toFixed(0)}%)`,
      metrics
    }
  }
  if (probe.directionAgreementFraction < thresholds.minDirectionAgreementFraction) {
    return {
      traversable: false,
      reason: "route-diverges",
      message: `Directional agreement is ${(probe.directionAgreementFraction * 100).toFixed(2)}% (minimum ${(thresholds.minDirectionAgreementFraction * 100).toFixed(0)}%)`,
      metrics
    }
  }
  return { traversable: true, metrics }
}