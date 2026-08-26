import { readFile } from "node:fs/promises"
import path from "node:path"
import { readAtlasArt } from "@/lib/gpx/atlas"
import { buildRouteStory } from "@/lib/gpx/route-story"
import type { RouteStoryInput } from "@/lib/gpx/route-story"
import { isGpxIntelligenceReport } from "@/lib/gpx/intelligence"

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, max-age=60" }
  })
}

export interface PublicAtlasRoute {
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  sourceProject: string
  profile?: string
  story: ReturnType<typeof buildRouteStory>
  art: boolean
}

/** Story + art metadata for a listed route; never host paths or geometry. */
type AtlasListingInput = RouteStoryInput & {
  sourceProject: string
  profile?: string
}

function publicAtlasRoute(
  route: AtlasListingInput,
  hasArt: boolean
): PublicAtlasRoute {
  return {
    id: route.id,
    name: route.name,
    distanceMiles: route.distanceMiles,
    durationMinutes: route.durationMinutes,
    twistiness: route.twistiness,
    turnCount: route.turnCount,
    sourceProject: route.sourceProject,
    ...(route.profile ? { profile: route.profile } : {}),
    story: buildRouteStory(route),
    art: hasArt
  }
}

/**
 * Existing project GPX catalog, extended with atlas stories + poster metadata.
 * The original listing/detail contract is unchanged; new fields are additive.
 */
export async function handleGpxCatalogRequest(request: Request, catalogRoot: string): Promise<Response> {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(catalogRoot, "manifest.json"), "utf8")
    ) as import("@/lib/gpx/catalog").ProjectGpxCatalog & { routes: Array<Parameters<typeof buildRouteStory>[0] & { profile?: string }> }
    const atlasArt = await readAtlasArt(catalogRoot)
    const requestedId = new URL(request.url).searchParams.get("id")

    if (!requestedId) {
      return json({
        generatedAt: manifest.generatedAt,
        scannedFiles: manifest.scannedFiles ?? 0,
        duplicateFiles: manifest.duplicateFiles ?? 0,
        uniqueFiles: manifest.uniqueFiles ?? manifest.routes.length,
        importedRoutes: manifest.importedRoutes ?? manifest.routes.length,
        rejectedFiles: manifest.rejectedFiles ?? 0,
        duplicateFamilies: manifest.duplicateFamilies ?? 0,
        nearDuplicateFamilies: manifest.nearDuplicateFamilies ?? 0,
        nearDuplicateRoutes: manifest.nearDuplicateRoutes ?? 0,
        routes: manifest.routes.map((route) => publicAtlasRoute(route, Boolean(atlasArt[route.id])))
      })
    }

    if (requestedId.length > 200 || !/^[A-Za-z0-9._-]+$/.test(requestedId)) {
      return json({ error: { code: "GPX_ROUTE_NOT_FOUND", message: "That imported GPX route was not found." } }, 404)
    }
    if (!manifest.routes.some((route) => route.id === requestedId)) {
      return json({ error: { code: "GPX_ROUTE_NOT_FOUND", message: "That imported GPX route was not found." } }, 404)
    }

    const route = JSON.parse(
      await readFile(path.join(catalogRoot, "routes", `${requestedId}.json`), "utf8")
    ) as Record<string, unknown> & {
      gpxIntelligence?: unknown
      id?: string
      name?: string
      distanceMiles?: number
      durationMinutes?: number
      twistiness?: number
      turnCount?: number
      sourceProject?: string
      profile?: string | null
      geometry?: unknown
    }

    if ("gpxIntelligence" in route && !isGpxIntelligenceReport(route.gpxIntelligence)) {
      return json({ error: { code: "GPX_CATALOG_UNAVAILABLE", message: "The imported GPX intelligence report is invalid." } }, 503)
    }

    // Detail payload: full stored record plus the atlas story and poster art.
    const art = atlasArt[route.id ?? ""]
    const summaryInput = {
      id: String(route.id ?? requestedId),
      name: String(route.name ?? ""),
      distanceMiles: Number(route.distanceMiles ?? 0),
      durationMinutes: Number(route.durationMinutes ?? 0),
      twistiness: Number(route.twistiness ?? 0),
      turnCount: Number(route.turnCount ?? 0)
    }
    const detail = {
      ...route,
      story: buildRouteStory(summaryInput),
      poster: art ? { aspect: art.aspect, start: art.start, end: art.end } : null
    }
    return json(detail)
  } catch {
    return json({
      error: {
        code: "GPX_CATALOG_UNAVAILABLE",
        message: "The project GPX library is not available."
      }
    }, 503)
  }
}
