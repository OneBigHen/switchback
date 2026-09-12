/**
 * End-to-end traversability verification for retained atlas corridors.
 *
 * The canonical exporter proves, per OSM segment, that a corridor is built from
 * motorcycle-routable ways. That is a per-segment claim: it does not prove a
 * rider can actually ride the corridor end to end in the built GraphHopper
 * graph, where snapping, subnetwork handling and profile weighting all act on
 * the whole chain. Adversarial probing against the live service showed both
 * classes of contradiction on the NJ activation:
 *
 *   - a corridor whose every sample point snaps to a routable edge yet whose
 *     endpoint-to-endpoint route leaves it entirely (weight/deviation), and
 *   - corridors whose endpoint sits tens of metres off the routable network.
 *
 * This module turns those probes into an explicit, fail-closed verdict so a
 * corridor is only published as "routable" when the built graph can actually
 * carry it.
 */

export interface CorridorTraversalProbe {
  /** Metres from each corridor endpoint to the nearest routable edge, null when unsnappable. */
  endpointSnapMeters: readonly [number | null, number | null]
  /** Metres of the route GraphHopper returns between the corridor endpoints, null when it returns no path. */
  routeMeters: number | null
  /** Fraction (0..1) of sampled corridor points lying within the match radius of that route, null when unrouted. */
  corridorCoveredByRoute: number | null
}

export interface TraversabilityThresholds {
  /** Corridor/route coincidence tolerance, shared with route evidence matching. */
  matchRadiusMeters: number
  /** How far a corridor endpoint may sit from the routable network before it is off-network. */
  maxEndpointSnapMeters: number
  /** Minimum share of the corridor the returned route must follow to count as traversal. */
  minCoveredFraction: number
}

export const DEFAULT_TRAVERSABILITY_THRESHOLDS: TraversabilityThresholds = {
  matchRadiusMeters: 40,
  maxEndpointSnapMeters: 60,
  minCoveredFraction: 0.6
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
    endpointSnapMeters: probe.endpointSnapMeters
  }
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
  if (probe.routeMeters === null || probe.corridorCoveredByRoute === null) {
    return { traversable: false, reason: "no-route", message: "GraphHopper returned no route along the corridor", metrics }
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
  if (probe.corridorCoveredByRoute < thresholds.minCoveredFraction) {
    return {
      traversable: false,
      reason: "route-diverges",
      message: `Route follows ${(probe.corridorCoveredByRoute * 100).toFixed(2)}% of the corridor (minimum ${(thresholds.minCoveredFraction * 100).toFixed(0)}%)`,
      metrics
    }
  }
  return { traversable: true, metrics }
}
