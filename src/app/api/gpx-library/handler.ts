import path from "node:path"
import { readJsonCached } from "@/lib/gpx/catalog-cache"
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
  /**
   * Real-world extent as `[west, south, east, north]` in degrees, present when
   * poster art was generated for this route. Lets a client sort the library by
   * distance from the rider without downloading every route's geometry.
   */
  bbox?: readonly [number, number, number, number]
}

/** Story + art metadata for a listed route; never host paths or geometry. */
type AtlasListingInput = RouteStoryInput & {
  sourceProject: string
  profile?: string
}

function publicAtlasRoute(
  route: AtlasListingInput,
  hasArt: boolean,
  bbox: readonly [number, number, number, number] | undefined
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
    art: hasArt,
    ...(bbox ? { bbox } : {})
  }
}

/**
 * Fields an anonymous visitor may see on a single route. Allow-listed rather
 * than filtered, so a new field added to the stored record cannot leak by
 * default: the stored record also carries `sourceFiles` (host filesystem
 * paths), `sourceContentSha256`, `ingest` and `mapMatch`, which are import
 * bookkeeping and must stay server-side.
 */
const PUBLIC_DETAIL_FIELDS = [
  "id",
  "name",
  "profile",
  "geometry",
  "waypoints",
  "instructions",
  "distanceMiles",
  "durationMinutes",
  "ascentMeters",
  "descentMeters",
  "twistiness",
  "turnCount",
  "roadMix",
  "surfaceMix",
  "routingSource",
  "navigationMode",
  "previewOnly",
  "segmentStarts",
  "gpxIntelligence",
  "duplicateFamilyId",
  "duplicateFamilySize",
  "duplicateFamilyRole"
] as const

function pickPublicDetailFields(route: Record<string, unknown>): Record<string, unknown> {
  const publicRoute: Record<string, unknown> = {}
  for (const field of PUBLIC_DETAIL_FIELDS) {
    if (field in route) publicRoute[field] = route[field]
  }
  return publicRoute
}

/**
 * Existing project GPX catalog, extended with atlas stories + poster metadata.
 * The original listing/detail contract is unchanged; new fields are additive.
 */
export async function handleGpxCatalogRequest(request: Request, catalogRoot: string): Promise<Response> {
  try {
    const manifest = await readJsonCached(
      path.join(catalogRoot, "manifest.json")
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
        routes: manifest.routes.map((route) => publicAtlasRoute(route, Boolean(atlasArt[route.id]), atlasArt[route.id]?.bbox))
      })
    }

    if (requestedId.length > 200 || !/^[A-Za-z0-9._-]+$/.test(requestedId)) {
      return json({ error: { code: "GPX_ROUTE_NOT_FOUND", message: "That imported GPX route was not found." } }, 404)
    }
    if (!manifest.routes.some((route) => route.id === requestedId)) {
      return json({ error: { code: "GPX_ROUTE_NOT_FOUND", message: "That imported GPX route was not found." } }, 404)
    }

    const route = await readJsonCached(
      path.join(catalogRoot, "routes", `${requestedId}.json`)
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

    // Detail payload: the allow-listed public record plus atlas story and art.
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
      ...pickPublicDetailFields(route),
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
