import type { TripPlan } from "@/lib/routing/planner"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"

/** Active route entities are bounded; saved-library routes live in IndexedDB. */
export const MAX_ACTIVE_ROUTE_ENTITIES = 32
export const MAX_ROUTE_GEOMETRY_POINTS = 50_000
const MAX_RETAINED_ROUTE_ENTITIES = 4

export type PlannedRouteSummary = Omit<PlannedRoute, "geometry">
export type RoutePlanSummary = Omit<TripPlan, "routes"> & {
  routes: PlannedRouteSummary[]
}

export interface RouteEntityCache {
  replace(routes: readonly PlannedRoute[]): PlannedRouteSummary[]
  merge(routes: readonly PlannedRoute[]): PlannedRouteSummary[]
  get(id: string): PlannedRoute | undefined
  getMany(ids: readonly string[]): PlannedRoute[]
  retain(id: string): void
  release(id: string): void
  invalidate(): void
  clear(): void
  size(): number
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
}

function validateRoutes(routes: readonly PlannedRoute[]): void {
  if (routes.length > MAX_ACTIVE_ROUTE_ENTITIES) {
    throw new Error(`Active route cache accepts at most ${MAX_ACTIVE_ROUTE_ENTITIES} routes.`)
  }
  const ids = new Set<string>()
  for (const route of routes) {
    if (typeof route.id !== "string" || route.id.length === 0 || ids.has(route.id)) {
      throw new Error("Active route cache received a duplicate or missing route id.")
    }
    if (
      !Array.isArray(route.geometry) ||
      route.geometry.length > MAX_ROUTE_GEOMETRY_POINTS ||
      !route.geometry.every(isCoordinate)
    ) {
      throw new Error(`Active route cache received invalid geometry for route ${route.id}.`)
    }
    ids.add(route.id)
  }
}

function summary(route: PlannedRoute): PlannedRouteSummary {
  const { geometry, ...rest } = route
  void geometry
  return rest
}

export function createRouteEntityCache(): RouteEntityCache {
  let entities = new Map<string, PlannedRoute>()
  const retained = new Set<string>()

  function checkCapacity(routes: readonly PlannedRoute[]): void {
    const fresh = routes.filter((route) => !entities.has(route.id))
    if (entities.size + fresh.length > MAX_ACTIVE_ROUTE_ENTITIES) {
      throw new Error("Active route cache capacity would be exceeded.")
    }
  }

  return {
    replace(routes) {
      validateRoutes(routes)
      const retainedEntities = [...retained]
        .map((id) => entities.get(id))
        .filter((route): route is PlannedRoute => route !== undefined)
      const next = new Map([...retainedEntities, ...routes].map((route) => [route.id, route]))
      if (next.size > MAX_ACTIVE_ROUTE_ENTITIES) {
        throw new Error("Active route cache capacity would be exceeded.")
      }
      entities = next
      return routes.map(summary)
    },
    merge(routes) {
      validateRoutes(routes)
      checkCapacity(routes)
      for (const route of routes) entities.set(route.id, route)
      return routes.map(summary)
    },
    get(id) {
      return entities.get(id)
    },
    getMany(ids) {
      return ids.flatMap((id) => {
        const route = entities.get(id)
        return route ? [route] : []
      })
    },
    retain(id) {
      if (!entities.has(id) || retained.has(id)) return
      if (retained.size >= MAX_RETAINED_ROUTE_ENTITIES) {
        const oldest = retained.keys().next().value
        if (oldest !== undefined) retained.delete(oldest)
      }
      retained.add(id)
    },
    release(id) {
      retained.delete(id)
    },
    invalidate() {
      entities = new Map([...entities].filter(([id]) => retained.has(id)))
    },
    clear() {
      entities.clear()
      retained.clear()
    },
    size() {
      return entities.size
    }
  }
}

export const routeEntityCache = createRouteEntityCache()
