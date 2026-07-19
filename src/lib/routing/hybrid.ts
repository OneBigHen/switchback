import type { RouteProvider, RoutingResult } from "./planner"
import type { PlannedRoute, RouteRequest } from "./types"
import { calculateGeometryOverlap } from "./scoring"

export interface HybridRouteProviderOptions {
  graphHopper: RouteProvider
  valhalla?: RouteProvider
  enrich?: (result: RoutingResult) => Promise<RoutingResult>
}

const DUPLICATE_OVERLAP_PERCENT = 97

function supportsValhallaCandidate(request: RouteRequest): boolean {
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

function mergeDistinct(primary: PlannedRoute[], supplemental: PlannedRoute[]): PlannedRoute[] {
  const merged = [...primary]
  for (const candidate of supplemental) {
    const duplicate = merged.some((existing) =>
      calculateGeometryOverlap(existing.geometry, candidate.geometry) >= DUPLICATE_OVERLAP_PERCENT
    )
    if (!duplicate) merged.push(candidate)
  }
  return merged
}

function rejectionMessage(reason: unknown): string {
  return reason instanceof Error && reason.message.trim()
    ? reason.message.trim()
    : "provider request failed"
}

export function createHybridRouteProvider(options: HybridRouteProviderOptions): RouteProvider {
  return async (request: RouteRequest): Promise<RoutingResult> => {
    const valhallaEligible = Boolean(options.valhalla && supportsValhallaCandidate(request))
    const [graphHopperAttempt, valhallaAttempt] = await Promise.all([
      options.graphHopper(request).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason })
      ),
      valhallaEligible
        ? options.valhalla!(request).then(
            (value) => ({ status: "fulfilled" as const, value }),
            (reason: unknown) => ({ status: "rejected" as const, reason })
          )
        : Promise.resolve({ status: "skipped" as const })
    ])

    if (graphHopperAttempt.status === "rejected" && valhallaAttempt.status !== "fulfilled") {
      throw graphHopperAttempt.reason
    }

    const warnings: string[] = []
    let routes: PlannedRoute[] = []
    let engine: RoutingResult["engine"]
    let engineVersion: string

    if (graphHopperAttempt.status === "fulfilled") {
      routes = withProvenance(graphHopperAttempt.value, "graphhopper")
      warnings.push(...(graphHopperAttempt.value.warnings ?? []))
      engine = "graphhopper"
      engineVersion = graphHopperAttempt.value.engineVersion
      if (valhallaAttempt.status === "fulfilled") {
        routes = mergeDistinct(routes, withProvenance(valhallaAttempt.value, "valhalla"))
        warnings.push(...(valhallaAttempt.value.warnings ?? []))
        engine = "hybrid"
        engineVersion = `graphhopper-${graphHopperAttempt.value.engineVersion}+valhalla-${valhallaAttempt.value.engineVersion}`
      } else if (valhallaAttempt.status === "rejected") {
        warnings.push(`Valhalla comparison unavailable: ${rejectionMessage(valhallaAttempt.reason)}.`)
      }
    } else if (valhallaAttempt.status === "fulfilled") {
      routes = withProvenance(valhallaAttempt.value, "valhalla")
      warnings.push(...(valhallaAttempt.value.warnings ?? []))
      warnings.push(`GraphHopper unavailable; Valhalla fallback preserved this supported route: ${rejectionMessage(graphHopperAttempt.reason)}.`)
      engine = "valhalla"
      engineVersion = valhallaAttempt.value.engineVersion
    } else {
      // The rejected/rejected case is handled above. Keep this branch explicit
      // so TypeScript can prove that provider result values exist before use.
      throw graphHopperAttempt.reason
    }

    let result: RoutingResult = {
      engine,
      engineVersion,
      routes,
      ...(warnings.length > 0 ? { warnings } : {})
    }
    if (options.enrich) {
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
