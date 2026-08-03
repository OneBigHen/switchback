import type { RouteRequest } from "@/lib/routing/types"
import type { TripPlan } from "@/lib/routing/planner"

/**
 * Short-lived, bounded, in-memory cache for primary route results.
 *
 * Replans and repeated golden tests should not repeat identical provider
 * work. Keys are normalized from routing-affecting fields only — no user
 * identity, planning ids, or prompt text ever enters a key. Alternatives
 * are intentionally not cached: they are stateless and short-deadlined.
 */
export interface RouteCache {
  get(key: string): TripPlan | undefined
  set(key: string, plan: TripPlan): void
}

interface CacheEntry {
  plan: TripPlan
  expiresAt: number
}

export function createRouteCache(
  options: { ttlMs?: number; maxEntries?: number } = {}
): RouteCache {
  const ttlMs = options.ttlMs ?? 10 * 60_000
  const maxEntries = options.maxEntries ?? 50
  const entries = new Map<string, CacheEntry>()

  function prune(): void {
    const now = Date.now()
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key)
    }
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) break
      entries.delete(oldest)
    }
  }

  return {
    get(key) {
      prune()
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key)
        return undefined
      }
      return entry.plan
    },
    set(key, plan) {
      entries.set(key, { plan, expiresAt: Date.now() + ttlMs })
      prune()
    }
  }
}

function roundCoordinate(value: number, digits = 4): number {
  return Number(value.toFixed(digits))
}

/**
 * Normalized cache key. Point coordinates are rounded to ~10 m so
 * equivalent replans share a key; routing-affecting preferences are
 * included verbatim; identity and free-text fields are excluded.
 */
export function routeCacheKey(request: RouteRequest): string {
  const normalized = {
    profile: request.profile,
    points: request.points.map((point) => [
      roundCoordinate(point.lat),
      roundCoordinate(point.lon)
    ]),
    avoidHighways: request.avoidHighways ?? false,
    tollPolicy: request.tollPolicy ?? "allow-with-warning",
    avoidAreas: (request.avoidAreas ?? []).map((area) => area.id).sort(),
    roadLocks: (request.roadLocks ?? []).map((lock) => lock.id).sort(),
    segmentProfiles: request.segmentProfiles ?? [],
    targetMinutes: request.targetMinutes ?? null,
    loopTargetMinutes: request.loopTargetMinutes ?? null,
    roundTrip: request.roundTrip
      ? {
          targetMinutes: request.roundTrip.targetMinutes,
          seed: request.roundTrip.seed ?? null,
          heading: request.roundTrip.heading ?? null
        }
      : null,
    candidateSet: request.candidateSet ?? "primary"
  }
  return JSON.stringify(normalized)
}
