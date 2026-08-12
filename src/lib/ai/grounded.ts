import type { PlannedRoute } from "@/lib/routing/types"

export interface GroundedRouteDescription {
  summary: string
  facts: {
    distanceMiles: number
    durationMinutes: number
    turnCount: number
    twistiness: number
    routingSource: PlannedRoute["routingSource"]
    provider: PlannedRoute["provider"] | null
    surfaceMix: Record<string, number>
    roadMix: Record<string, number>
  }
  unsupported: string[]
}

function knownMix(mix: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(mix).filter(([, value]) => Number.isFinite(value) && value >= 0))
}

/** Describe only facts already present on the route contract. */
export function describeRouteGrounded(route: Pick<PlannedRoute, "distanceMiles" | "durationMinutes" | "turnCount" | "twistiness" | "routingSource" | "provider" | "surfaceMix" | "roadMix" | "tollEvidence" | "officialUnpavedEvidence">): GroundedRouteDescription {
  const distanceMiles = Number.isFinite(route.distanceMiles) ? route.distanceMiles : 0
  const durationMinutes = Number.isFinite(route.durationMinutes) ? route.durationMinutes : 0
  const turnCount = Number.isFinite(route.turnCount) ? route.turnCount : 0
  const twistiness = Number.isFinite(route.twistiness) ? route.twistiness : 0
  const surfaceMix = knownMix(route.surfaceMix)
  const roadMix = knownMix(route.roadMix)
  const unsupported: string[] = []
  if (!route.tollEvidence?.known) unsupported.push("toll exposure")
  if (!route.officialUnpavedEvidence) unsupported.push("official surface legality")
  if (Object.keys(surfaceMix).length === 0) unsupported.push("surface mix")
  const summary = `${distanceMiles.toFixed(1)} miles, about ${Math.round(durationMinutes)} minutes, with ${Math.round(turnCount)} mapped turns.`
  return {
    summary,
    facts: {
      distanceMiles,
      durationMinutes,
      turnCount,
      twistiness,
      routingSource: route.routingSource,
      provider: route.provider ?? null,
      surfaceMix,
      roadMix
    },
    unsupported
  }
}

export interface SpatialSearchBounds {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

export interface SpatialSearchRoute {
  id: string
  title: string
  center: [longitude: number, latitude: number]
  searchableText: string
  updatedAt?: string
}

export function searchRoutesSpatialFirst(
  routes: readonly SpatialSearchRoute[],
  input: { query?: string; bounds?: SpatialSearchBounds; limit?: number }
): SpatialSearchRoute[] {
  const bounds = input.bounds
  const candidates = routes.slice(0, 500).filter((route) => {
    if (!bounds) return true
    return route.center[0] >= bounds.minLon && route.center[0] <= bounds.maxLon && route.center[1] >= bounds.minLat && route.center[1] <= bounds.maxLat
  })
  const terms = (input.query ?? "").toLowerCase().split(/\s+/).map((term) => term.trim()).filter((term) => term.length >= 2).slice(0, 8)
  const scored = candidates.map((route) => {
    const title = route.title.toLowerCase()
    const text = `${title} ${route.searchableText}`.toLowerCase()
    const score = terms.reduce((total, term) => total + (title.includes(term) ? 4 : text.includes(term) ? 1 : 0), 0)
    return { route, score }
  }).filter((item) => terms.length === 0 || item.score > 0)
  scored.sort((a, b) => b.score - a.score || String(b.route.updatedAt ?? "").localeCompare(String(a.route.updatedAt ?? "")))
  return scored.slice(0, Math.max(1, Math.min(Math.floor(input.limit ?? 20), 50))).map((item) => item.route)
}
