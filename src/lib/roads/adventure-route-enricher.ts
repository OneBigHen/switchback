import { fetchPaUnpavedRoadsNearRoutes, type PaUnpavedRoadProviderOptions } from "./pa-unpaved"
import { calculatePaUnpavedRoadEvidence } from "./route-unpaved-evidence"
import {
  PA_UNPAVED_ROADS_PROVENANCE,
  type PaUnpavedRoadCorridorQuery,
  type PaUnpavedRoadFeatureCollection
} from "./types"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"

interface AdventureRouteEnricherOptions {
  fetchRoads?: (
    query: PaUnpavedRoadCorridorQuery,
    options?: PaUnpavedRoadProviderOptions
  ) => Promise<PaUnpavedRoadFeatureCollection>
  signal?: AbortSignal
}

export interface AdventureRouteEnrichmentResult {
  routes: PlannedRoute[]
  warnings: string[]
}

const PENNSYLVANIA_BOUNDS = {
  west: -80.65,
  south: 39.6,
  east: -74.45,
  north: 42.55
}

function routeTouchesPennsylvania(route: PlannedRoute): boolean {
  return route.geometry.some(([longitude, latitude]) =>
    longitude >= PENNSYLVANIA_BOUNDS.west && longitude <= PENNSYLVANIA_BOUNDS.east &&
    latitude >= PENNSYLVANIA_BOUNDS.south && latitude <= PENNSYLVANIA_BOUNDS.north
  )
}

/**
 * Profiles a rider picks *because* they want dirt. Gravel belongs here as much
 * as adventure does: asking for gravel and then being told nothing about the
 * historic PA DEP/PASDA — Unpaved Roads 2009_07 survey surface evidence is the
 * one answer the request rules out.
 */
const UNPAVED_SEEKING_PROFILES = new Set<RouteRequest["profile"]>(["adventure", "gravel"])

export async function enrichAdventureRoutesWithPaData(
  request: RouteRequest,
  routes: PlannedRoute[],
  options: AdventureRouteEnricherOptions = {}
): Promise<AdventureRouteEnrichmentResult> {
  if (options.signal?.aborted) throw options.signal.reason ?? new DOMException("Route enrichment was cancelled.", "AbortError")
  if (!UNPAVED_SEEKING_PROFILES.has(request.profile) || routes.length === 0) {
    return { routes, warnings: [] }
  }
  const eligibleRoutes = routes.filter(routeTouchesPennsylvania)
  if (eligibleRoutes.length === 0) return { routes, warnings: [] }

  try {
    const query = {
      paths: eligibleRoutes.map((route) => route.geometry),
      bufferMeters: 50,
      limit: 500
    }
    const fetchRoads = options.fetchRoads ?? fetchPaUnpavedRoadsNearRoutes
    const roads = options.signal
      ? await fetchRoads(query, { signal: options.signal })
      : await fetchRoads(query)
    if (roads.metadata?.truncated) {
      return {
        routes,
        warnings: [
          `${PA_UNPAVED_ROADS_PROVENANCE} survey scoring skipped because the corridor result was incomplete; survey surface overlap is unknown.`
        ]
      }
    }
    const eligibleIds = new Set(eligibleRoutes.map((route) => route.id))
    return {
      routes: routes.map((route) => eligibleIds.has(route.id) ? {
        ...route,
        officialUnpavedEvidence: calculatePaUnpavedRoadEvidence(route.geometry, roads)
      } : route),
      warnings: []
    }
  } catch (reason) {
    if (options.signal?.aborted) throw reason
    return {
      routes,
      warnings: [
        `${PA_UNPAVED_ROADS_PROVENANCE} survey scoring unavailable; survey surface overlap is unknown; using mapped surface data only.`
      ]
    }
  }
}
