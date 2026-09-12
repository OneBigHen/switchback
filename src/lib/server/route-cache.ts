import type { GravelAtlasIntensity, RouteRequest } from "@/lib/routing/types"
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
  size(): number
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
    },
    size() {
      prune()
      return entries.size
    }
  }
}

function roundCoordinate(value: number, digits = 4): number {
  return Number(value.toFixed(digits))
}

const GRAVEL_ATLAS_INTENSITIES = new Set<GravelAtlasIntensity>(["balanced", "more", "maximum"])
const GRAVEL_ATLAS_CACHE_POLICY_VERSION = 2

export interface RouteCacheNamespace {
  gravelAtlasGraphFingerprint?: string | null
  gravelAtlasSourceFingerprint?: string | null
}

function normalizedGravelAtlas(request: RouteRequest): { enabled: boolean; intensity: GravelAtlasIntensity } {
  const value = request.gravelAtlas
  if (
    (request.profile !== "adventure" && request.profile !== "gravel") ||
    value?.enabled !== true ||
    !GRAVEL_ATLAS_INTENSITIES.has(value.intensity)
  ) {
    return { enabled: false, intensity: "balanced" }
  }
  return { enabled: true, intensity: value.intensity }
}

function atlasCacheNamespace(namespace?: RouteCacheNamespace): RouteCacheNamespace {
  if (namespace) return namespace
  return {
    gravelAtlasGraphFingerprint: process.env.GRAVEL_ATLAS_GRAPH_FINGERPRINT?.trim() || null,
    gravelAtlasSourceFingerprint: process.env.GRAVEL_ATLAS_SOURCE_FINGERPRINT?.trim() || null
  }
}

/**
 * Normalized cache key. Point coordinates are rounded to ~10 m so
 * equivalent replans share a key; routing-affecting preferences are
 * included verbatim; identity and free-text fields are excluded.
 *
 * Atlas-enabled entries are additionally namespaced by the exact graph and
 * official-source fingerprints. A graph/source swap therefore cannot reuse a
 * route planned against an older verified Atlas, even when the process and its
 * in-memory cache stay alive across the swap.
 */
export function routeCacheKey(request: RouteRequest, namespace?: RouteCacheNamespace): string {
  const gravelAtlas = normalizedGravelAtlas(request)
  const atlasNamespace = atlasCacheNamespace(namespace)
  const normalized = {
    profile: request.profile,
    points: request.points.map((point) => [
      roundCoordinate(point.lat),
      roundCoordinate(point.lon)
    ]),
    avoidHighways: request.avoidHighways ?? false,
    tollPolicy: request.tollPolicy ?? "allow-with-warning",
    gravelAtlas,
    gravelAtlasBuild: gravelAtlas.enabled
      ? {
          policyVersion: GRAVEL_ATLAS_CACHE_POLICY_VERSION,
          graphFingerprint: atlasNamespace.gravelAtlasGraphFingerprint?.trim() || null,
          sourceFingerprint: atlasNamespace.gravelAtlasSourceFingerprint?.trim() || null
        }
      : null,
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
    candidateSet: request.candidateSet ?? "primary",
    // The drawn stroke changes the response (the primary carries its
    // adherence), so two plans over identical points but different strokes
    // must not share a cache entry.
    sketchCorridor: (request.sketchCorridor ?? []).map((coordinate) => [
      roundCoordinate(coordinate[0]),
      roundCoordinate(coordinate[1])
    ])
  }
  return JSON.stringify(normalized)
}
