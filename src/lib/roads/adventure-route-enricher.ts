import { fetchPaUnpavedRoadsNearRoutes } from "./pa-unpaved"
import { calculatePaUnpavedRoadEvidence } from "./route-unpaved-evidence"
import type { PaUnpavedRoadCorridorQuery, PaUnpavedRoadFeatureCollection } from "./types"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"

interface AdventureRouteEnricherOptions {
  fetchRoads?: (query: PaUnpavedRoadCorridorQuery) => Promise<PaUnpavedRoadFeatureCollection>
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

export async function enrichAdventureRoutesWithPaData(
  request: RouteRequest,
  routes: PlannedRoute[],
  options: AdventureRouteEnricherOptions = {}
): Promise<AdventureRouteEnrichmentResult> {
  if (request.profile !== "adventure" || routes.length === 0) {
    return { routes, warnings: [] }
  }
  const eligibleRoutes = routes.filter(routeTouchesPennsylvania)
  if (eligibleRoutes.length === 0) return { routes, warnings: [] }

  try {
    const roads = await (options.fetchRoads ?? fetchPaUnpavedRoadsNearRoutes)({
      paths: eligibleRoutes.map((route) => route.geometry),
      bufferMeters: 50,
      limit: 500
    })
    if (roads.metadata?.truncated) {
      return {
        routes,
        warnings: ["Official PA unpaved-road scoring was skipped because the corridor result was incomplete."]
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
  } catch {
    return {
      routes,
      warnings: ["Official PA unpaved-road scoring unavailable; using mapped surface data only."]
    }
  }
}
