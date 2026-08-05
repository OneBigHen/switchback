import type { RouteProvider, RoutingResult } from "./planner"
import { evaluateRoadLockSatisfaction } from "@/lib/roads/road-locks"
import type { PlannedRoute } from "./types"
import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"

export interface HybridRouteProviderOptions {
  graphHopper: RouteProvider
  valhalla?: RouteProvider
  enrich?: (result: RoutingResult) => Promise<RoutingResult>
}

function supportsValhallaCandidate(request: NormalizedRouteRequest): boolean {
  return !request.roundTrip && request.profile !== "adventure" && request.points.length >= 2
}

function withProvenance(
  result: RoutingResult,
  provider: "graphhopper" | "valhalla"
): PlannedRoute[] {
  return result.routes.map((route) => ({
    ...route,
    provider,
    providerVersion: result.engineVersion
  }))
}

/**
 * Compute and attach per-lock satisfaction results to every candidate.
 * This is the union of satisfactions across both engines: each candidate
 * gets its own evaluation reflecting how its geometry meets each lock's
 * corridor. A must lock that is not satisfied produces a `RoadLockSatisfaction`
 * with `satisfied: false` and a reason, never a silent drop.
 */
function attachRoadLockSatisfaction(
  routes: PlannedRoute[],
  roadLocks: NormalizedRouteRequest["roadLocks"]
): PlannedRoute[] {
  if (!roadLocks || roadLocks.length === 0) return routes
  return routes.map((route) => ({
    ...route,
    lockSatisfaction: roadLocks.map((lock) => evaluateRoadLockSatisfaction(lock, route.geometry))
  }))
}

function rejectionMessage(reason: unknown): string {
  return reason instanceof Error && reason.message.trim()
    ? reason.message.trim()
    : "provider request failed"
}

export function createHybridRouteProvider(options: HybridRouteProviderOptions): RouteProvider {
  return async (request, providerOptions): Promise<RoutingResult> => {
    const valhallaEligible = Boolean(options.valhalla && supportsValhallaCandidate(request))
    // Phase 2: GraphHopper is the primary engine. Valhalla is used only as a
    // failure fallback for eligible requests — never as a parallel supplement
    // that delays the primary route.
    let graphHopperResult: RoutingResult
    try {
      graphHopperResult = await options.graphHopper(request, providerOptions)
    } catch (graphHopperReason) {
      if (!valhallaEligible) throw graphHopperReason
      try {
        const valhallaFallback = await options.valhalla!(request, providerOptions)
        const routes = withProvenance(valhallaFallback, "valhalla")
        const warnings = [
          ...(valhallaFallback.warnings ?? []),
          `GraphHopper unavailable; Valhalla fallback preserved this supported route: ${rejectionMessage(graphHopperReason)}.`
        ]
        return {
          engine: "valhalla",
          engineVersion: valhallaFallback.engineVersion,
          routes: attachRoadLockSatisfaction(routes, request.roadLocks),
          warnings
        }
      } catch {
        // The primary engine's failure is the authoritative signal.
        throw graphHopperReason
      }
    }

    const warnings = [...(graphHopperResult.warnings ?? [])]
    let result: RoutingResult = {
      engine: "graphhopper",
      engineVersion: graphHopperResult.engineVersion,
      routes: attachRoadLockSatisfaction(
        withProvenance(graphHopperResult, "graphhopper"),
        request.roadLocks
      ),
      ...(warnings.length > 0 ? { warnings } : {})
    }
    // Elevation enrichment is background evidence on the alternatives call;
    // it never delays the primary route.
    if (options.enrich && request.candidateSet === "alternatives") {
      try {
        result = await options.enrich(result)
      } catch {
        result = {
          ...result,
          warnings: [...(result.warnings ?? []), "Elevation enrichment unavailable; route geometry was preserved."]
        }
      }
    }
    return result
  }
}
