export interface RouteDetailsWorkspaceState {
  readonly routeId: string
  readonly routeSetKey: string
}

export interface RouteIdentity {
  readonly id: string
}

/**
 * Stable identity for the candidate set shown when a details workspace opens.
 *
 * Route ids are derived from profile and geometry, so replanning the same trip
 * yields the same ids. The set — not the id alone — is what tells a reopened
 * workspace apart from one that survived a replan.
 */
export function routeSetKey(routes: readonly RouteIdentity[]): string {
  return routes.map((route) => route.id).join("|")
}

export function openRouteDetails(
  routeId: string,
  routes: readonly RouteIdentity[]
): RouteDetailsWorkspaceState {
  return { routeId, routeSetKey: routeSetKey(routes) }
}

/**
 * Details are valid only for the exact candidate set and canonical selection
 * that opened them. Selection can also move from the map, and a workspace left
 * pointing at the previous route would keep its directions, preparation actions
 * and Start ride button aimed at a route the rider is no longer looking at — so
 * a map selection or a replan returns them to route choice instead.
 */
export function resolveRouteDetails<T extends RouteIdentity>(
  workspace: RouteDetailsWorkspaceState | null,
  routes: readonly T[],
  selectedId: string
): T | null {
  if (!workspace) return null
  if (workspace.routeSetKey !== routeSetKey(routes)) return null
  if (workspace.routeId !== selectedId) return null
  return routes.find((route) => route.id === workspace.routeId) ?? null
}
