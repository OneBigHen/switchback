import { handleRouteRequest } from "./handler"
import { enrichAdventureRoutesWithPaData } from "@/lib/roads/adventure-route-enricher"
import { requestGraphHopperRoutes } from "@/lib/routing/graphhopper"
import { createHybridRouteProvider } from "@/lib/routing/hybrid"
import { requestValhallaRoutes, enrichWithElevations } from "@/lib/routing/valhalla"
import { createRouteJobLimiter } from "@/lib/server/route-job-limiter"
import { createRouteCache } from "@/lib/server/route-cache"
import { CurvatureRepository } from "@/lib/curvature/repository"
import { loadRouteGeometry } from "@/lib/gpx/route-geometry"
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

  return sources
}

export async function POST(request: Request): Promise<Response> {
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
