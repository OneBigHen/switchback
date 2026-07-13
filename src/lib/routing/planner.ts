import type { GraphHopperResult } from "./graphhopper"
import type { PlannedRoute, RouteRequest } from "./types"
import { calculateGeometryOverlap } from "./scoring"

export interface TripPlanRequest extends RouteRequest {
  compare?: boolean
}

export interface TripPlan {
  selectedRouteId: string
  routes: PlannedRoute[]
  warnings: string[]
}

export type RouteProvider = (request: RouteRequest) => Promise<GraphHopperResult>

const comparisonProfiles = {
  quick: ["twisty", "scenic"],
  twisty: ["scenic", "quick"],
  scenic: ["twisty", "quick"],
  adventure: ["twisty", "quick"]
} as const

export async function planMotorcycleTrip(
  request: TripPlanRequest,
  provider: RouteProvider
): Promise<TripPlan> {
  const selectedResult = await provider(request)
  const selected = selectedResult.routes[0]
  if (!selected) {
    throw new Error("The selected profile returned no routes")
  }

  const routes: PlannedRoute[] = [{ ...selected, overlapPercent: 100 }]
  const warnings: string[] = []
  if (!request.compare) {
    return { selectedRouteId: selected.id, routes, warnings }
  }

  const profiles = comparisonProfiles[request.profile]
  const comparisons = await Promise.allSettled(
    profiles.map((profile) => provider({ ...request, profile }))
  )

  comparisons.forEach((result, index) => {
    const profile = profiles[index]
    if (result.status === "rejected") {
      warnings.push(`${profile} comparison unavailable.`)
      return
    }
    const candidate = result.value.routes[0]
    if (!candidate) {
      warnings.push(`${profile} comparison returned no route.`)
      return
    }
    const overlapPercent = calculateGeometryOverlap(selected.geometry, candidate.geometry)
    if (overlapPercent >= 98) {
      warnings.push(`Dropped duplicate ${profile} route.`)
      return
    }
    routes.push({ ...candidate, overlapPercent })
  })

  return { selectedRouteId: selected.id, routes, warnings }
}
