import { handleRouteRequest } from "./handler"
import { enrichAdventureRoutesWithPaData } from "@/lib/roads/adventure-route-enricher"
import { GravelAtlasRepository } from "@/lib/roads/gravel-atlas/repository"
import { requestGraphHopperRoutes } from "@/lib/routing/graphhopper"
import { createHybridRouteProvider } from "@/lib/routing/hybrid"
import { requestValhallaRoutes, enrichWithElevations } from "@/lib/routing/valhalla"
import { createGravelAtlasAwareProvider } from "@/lib/routing/gravel-atlas-provider"
import { createRouteJobLimiter } from "@/lib/server/route-job-limiter"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { createRouteCache } from "@/lib/server/route-cache"
import { CurvatureRepository } from "@/lib/curvature/repository"
import { loadRouteGeometry } from "@/lib/gpx/route-geometry"
import { hintsFromAdviser } from "@/lib/routing/destination-corridors"
import { corridorCacheKey, createCorridorCache } from "@/lib/server/corridor-cache"
import { characterForProfile } from "@/lib/domain/routing/ride-character"
import { setRouteRuntimeProbe } from "@/lib/server/runtime-diagnostics"
import type { CorridorSourceCandidates } from "@/lib/routing/destination-corridors"
import type { RouteRequest } from "@/lib/routing/types"
import { readFile } from "node:fs/promises"
import path from "node:path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Shared across requests: two provider tokens with primary priority, plus a
// bounded 10-minute primary-result cache. Health probes bypass both.
const providerLimiter = createRouteJobLimiter(2)
const routeCache = createRouteCache()
setRouteRuntimeProbe(() => ({
  routeRunningJobs: providerLimiter.runningCount(),
  routeQueuedJobs: providerLimiter.queuedCount(),
  routeCacheEntries: routeCache.size()
}))
// Request-level guard on top of the provider queue: the corridor resolver
// and PASDA enrichment run outside the provider tokens, so a flood of
// requests would still burn host CPU and external quota.
const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 10, label: "route request" })
// Phase 5 merge: the adviser endpoint writes here; the primary path reads it
// locally so background research never blocks routing.
const corridorCache = createCorridorCache(
  process.env.CORRIDOR_CACHE_PATH ?? path.join(process.cwd(), "data/route-research-cache.sqlite")
)

const MAX_GRAVEL_ATLAS_LATERAL_MILES = 40

function gravelAtlasBounds(request: RouteRequest): {
  south: number
  west: number
  north: number
  east: number
} {
  const lons = request.points.map((point) => point.lon)
  const lats = request.points.map((point) => point.lat)
  const meanLatitude = lats.reduce((sum, latitude) => sum + latitude, 0) / Math.max(1, lats.length)
  const latitudePadding = MAX_GRAVEL_ATLAS_LATERAL_MILES / 69
  const longitudeMilesPerDegree = 69 * Math.max(0.2, Math.cos(meanLatitude * Math.PI / 180))
  const longitudePadding = MAX_GRAVEL_ATLAS_LATERAL_MILES / longitudeMilesPerDegree
  return {
    south: Math.max(-90, Math.min(...lats) - latitudePadding),
    west: Math.max(-180, Math.min(...lons) - longitudePadding),
    north: Math.min(90, Math.max(...lats) + latitudePadding),
    east: Math.min(180, Math.max(...lons) + longitudePadding)
  }
}

/**
 * Phase 4 corridor sources: curvature database segments near the request,
 * known-good GPX route geometries, optional research hints, and (when the
 * rider explicitly opts in) graph-fresh Gravel Atlas corridors. Every source
 * degrades to empty evidence rather than failing normal routing.
 */
async function resolveCorridors(request: RouteRequest): Promise<CorridorSourceCandidates> {
  const sources: CorridorSourceCandidates = { curvatureSegments: [], gpxRoutes: [], hints: [] }
  const lons = request.points.map((point) => point.lon)
  const lats = request.points.map((point) => point.lat)
  const south = Math.min(...lats) - 0.1
  const north = Math.max(...lats) + 0.1
  const west = Math.min(...lons) - 0.1
  const east = Math.max(...lons) + 0.1

  const databasePath = process.env.CURVATURE_DB_PATH ?? path.join(process.cwd(), "data/segments.db")
  try {
    sources.curvatureSegments = new CurvatureRepository(databasePath).queryBounds({
      south, west, north, east,
      minScore: 70,
      limit: 24
    })
  } catch {
    // Curvature evidence is optional; normal routing still works.
  }

  const gpxLibraryPath = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
  try {
    const manifest = JSON.parse(
      await readFile(path.join(gpxLibraryPath, "manifest.json"), "utf8")
    ) as { routes?: Array<{ id: string; name?: string }> }
    const routes = (manifest.routes ?? []).slice(0, 12)
    for (const entry of routes) {
      const loaded = await loadRouteGeometry(entry.id, gpxLibraryPath, entry.name ?? "Imported GPX")
      if (loaded.route) sources.gpxRoutes.push(loaded.route)
    }
  } catch {
    // GPX corridors are optional evidence.
  }

  // The atlas database is deliberately separate from the imported-ride Route
  // Atlas (poster artwork). Only an explicitly enabled Adventure/Gravel
  // request and matching graph + official-source fingerprints may load routing
  // evidence. Missing either fingerprint disables the Atlas rather than mixing
  // stale verification with a newer graph or source snapshot.
  const graphFingerprint = process.env.GRAVEL_ATLAS_GRAPH_FINGERPRINT?.trim()
  const sourceFingerprint = process.env.GRAVEL_ATLAS_SOURCE_FINGERPRINT?.trim()
  if (request.gravelAtlas?.enabled === true && graphFingerprint && sourceFingerprint) {
    try {
      const atlasBounds = gravelAtlasBounds(request)
      const atlasPath = process.env.GRAVEL_ATLAS_DB_PATH ??
        path.join(process.cwd(), "data/gravel-atlas.sqlite")
      sources.gravelAtlas = {
        preference: request.gravelAtlas,
        corridors: new GravelAtlasRepository(atlasPath).queryBounds({
          ...atlasBounds,
          graphFingerprint,
          sourceFingerprint,
          limit: 200
        })
      }
    } catch {
      // Missing/stale/malformed atlas data must never block ordinary routing.
    }
  }

  // Validated adviser hints from the 7-day cache: fast local read, so the
  // background refresh (fired from the alternatives flow) warms the next plan
  // without ever delaying this one.
  if (request.points.length >= 2 && request.targetMinutes != null) {
    try {
      const cached = corridorCache.get(corridorCacheKey({
        start: request.points[0]!,
        finish: request.points[request.points.length - 1]!,
        targetMinutes: request.targetMinutes,
        character: characterForProfile(request.profile)
      })) ?? []
      sources.hints = hintsFromAdviser(cached)
    } catch {
      // Cache reads are optional evidence.
    }
  }

  return sources
}

async function handleRoutePost(request: Request): Promise<Response> {
  const routerBaseUrl = process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989"
  const valhallaUrl = process.env.VALHALLA_URL
  const elevationUrl = process.env.VALHALLA_ELEVATION_URL

  const baseProvider = createHybridRouteProvider({
    graphHopper: (routeRequest, providerOptions) => providerLimiter.run(
      () => requestGraphHopperRoutes(routeRequest, {
        baseUrl: routerBaseUrl,
        ...(providerOptions?.signal ? { signal: providerOptions.signal } : {})
      }),
      {
        priority: routeRequest.candidateSet === "alternatives" ? "alternatives" : "primary",
        signal: providerOptions?.signal
      }
    ),
    ...(valhallaUrl ? {
      valhalla: (routeRequest, providerOptions) => providerLimiter.run(
        () => requestValhallaRoutes(routeRequest, {
          baseUrl: valhallaUrl,
          ...(providerOptions?.signal ? { signal: providerOptions.signal } : {})
        }),
        {
          priority: routeRequest.candidateSet === "alternatives" ? "alternatives" : "primary",
          signal: providerOptions?.signal
        }
      )
    } : {}),
    ...(elevationUrl ? {
      enrich: (result) => enrichWithElevations(result, {
        baseUrl: elevationUrl,
        signal: request.signal
      })
    } : {})
  })
  const provider = createGravelAtlasAwareProvider(baseProvider, resolveCorridors)

  return handleRouteRequest(
    request,
    provider,
    enrichAdventureRoutesWithPaData,
    { cache: routeCache, resolveCorridors }
  )
}

export const POST = withRateLimit(requestLimiter, handleRoutePost)
