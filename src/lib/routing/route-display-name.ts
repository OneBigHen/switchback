import type { PlannedRoute } from "./types"

/** The named roads carrying most of the route, longest first. */
export function routeViaRoads(route: Pick<PlannedRoute, "instructions">, limit = 2): string[] {
  const meters = new Map<string, number>()
  for (const instruction of route.instructions) {
    const name = instruction.streetName?.trim()
    if (!name) continue
    meters.set(name, (meters.get(name) ?? 0) + instruction.distanceMeters)
  }
  return [...meters.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([name]) => name)
}

const ENGINE_ALTERNATIVE_NAME = /^(.+?) alternative \d+$/

/**
 * A rider-facing name for the card. Engine generation names ("Scenic
 * alternative 3") say how the candidate was produced, not what it is; they
 * become the style plus the roads that distinguish it (UX-AUDIT U10).
 */
export function routeDisplayName(route: Pick<PlannedRoute, "name" | "instructions">): string {
  const generated = route.name.match(ENGINE_ALTERNATIVE_NAME)
  if (!generated) return route.name
  const via = routeViaRoads(route)
  return via.length > 0 ? `${generated[1]} via ${via.join(" & ")}` : `${generated[1]} option`
}
