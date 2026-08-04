import { handleRouteRequest } from "./handler"
import { enrichAdventureRoutesWithPaData } from "@/lib/roads/adventure-route-enricher"
import { requestGraphHopperRoutes } from "@/lib/routing/graphhopper"
import { createHybridRouteProvider } from "@/lib/routing/hybrid"
import { requestValhallaRoutes, enrichWithElevations } from "@/lib/routing/valhalla"
import { createRouteJobLimiter } from "@/lib/server/route-job-limiter"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import { createRouteCache } from "@/lib/server/route-cache"
import { CurvatureRepository } from "@/lib/curvature/repository"
import { loadRouteGeometry } from "@/lib/gpx/route-geometry"
import { hintsFromAdviser } from "@/lib/routing/destination-corridors"
import { corridorCacheKey, createCorridorCache } from "@/lib/server/corridor-cache"
import { characterForProfile } from "@/lib/client/corridor-hints-client"
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
// Request-level guard on top of the provider queue: the corridor resolver
// and PASDA enrichment run outside the provider tokens, so a flood of
// requests would still burn host CPU and external quota.
const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 10, label: "route request" })
// Phase 5 merge: the adviser endpoint writes here; the primary path reads it
// locally so background research never blocks routing.
const corridorCache = createCorridorCache(
  process.env.CORRIDOR_CACHE_PATH ?? path.join(process.cwd(), "data/route-research-cache.sqlite")
)

/**
 * Phase 4 corridor sources: curvature database segments near the request and
 * known-good GPX route geometries from the server-side library. Both degrade
 * to empty sets (never fail routing) when their data is unavailable.
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

  const provider = createHybridRouteProvider({
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

  return handleRouteRequest(
    request,
    provider,
    enrichAdventureRoutesWithPaData,
    { cache: routeCache, resolveCorridors }
  )
}

export const POST = withRateLimit(requestLimiter, handleRoutePost)
