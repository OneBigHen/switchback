type RoutePreviewListener = () => void

let previewRouteId: string | null = null
const listeners = new Set<RoutePreviewListener>()

/**
 * Ephemeral presentation state shared by route cards, the map, and bounded
 * recommendation UI. It is deliberately not part of the persisted planner
 * store: committed route selection remains `selectedRouteId` there.
 */
export function getRoutePreviewId(): string | null {
  return previewRouteId
}

export function subscribeRoutePreview(listener: RoutePreviewListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setRoutePreviewId(routeId: string | null): void {
  if (previewRouteId === routeId) return
  previewRouteId = routeId
  for (const listener of listeners) listener()
}

export function clearRoutePreviewIfInvalid(validRouteIds: readonly string[]): void {
  if (previewRouteId === null || validRouteIds.includes(previewRouteId)) return
  setRoutePreviewId(null)
}
