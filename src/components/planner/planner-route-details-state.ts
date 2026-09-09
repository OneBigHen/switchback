export interface RouteDetailsWorkspaceState {
  readonly routeId: string
  readonly routeSetKey: string
}

export interface RouteIdentity {
  readonly id: string
}

/** Stable identity for the candidate set shown when a details workspace opens. */
export function routeSetKey(routes: readonly RouteIdentity[]): string {
  return routes.map((route) => route.id).join("|")
}

export function openRouteDetails(routeId: string, routes: readonly RouteIdentity[]): RouteDetailsWorkspaceState {
  return { routeId, routeSetKey: routeSetKey(routes) }
}

/**
 * Details are valid only for the exact candidate set and canonical selection
 * that opened them. A map selection or replan immediately returns the rider to
 * route choice instead of leaving actions pointed at an older route.
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
