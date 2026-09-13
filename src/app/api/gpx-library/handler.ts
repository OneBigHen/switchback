import path from "node:path"
import { readJsonCached } from "@/lib/gpx/catalog-cache"
import { readAtlasArt } from "@/lib/gpx/atlas"
import type { AtlasRouteArt } from "@/lib/gpx/atlas"
import {
  classifyCatalogArea,
  cleanCatalogRouteName,
  knownDurationMinutes,
  type CatalogArea
} from "@/lib/gpx/catalog-presentation"
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
  /** Cleaned rider-facing name (import ordering and site bylines removed). */
  name: string
  distanceMiles: number
  /** Imported moving time, or `null` when the import carried none. Never `0`. */
  durationMinutes: number | null
  twistiness: number
  turnCount: number
  sourceProject: string
  profile?: string
  story: ReturnType<typeof buildRouteStory>
  art: boolean
  /** Coarse bbox-derived filing; `{ region: null, ridingAreas: [] }` when unplaceable. */
  area: CatalogArea
  duplicateFamilyId?: string
  duplicateFamilySize?: number
  duplicateFamilyRole?: "canonical" | "near-duplicate"
  /** Set when atlas art marks this route as a geometry-identical re-import. */
  duplicateOf?: string
  /**
   * Real-world extent as `[west, south, east, north]` in degrees, present when
   * poster art was generated for this route. Lets a client sort the library by
   * distance from the rider without downloading every route's geometry.
   */
  bbox?: readonly [number, number, number, number]
}

/**
 * Story + filing metadata for a listed route; never host paths, geometry,
 * waypoints, instructions, or preview path data. Full geometry is served only
 * by the `?id=` detail request that Open in Planner / Save to My Rides use.
 */
type AtlasListingInput = RouteStoryInput & {
  sourceProject: string
  profile?: string
  duplicateFamilyId?: string
  duplicateFamilySize?: number
  duplicateFamilyRole?: "canonical" | "near-duplicate"
}

function displayName(name: unknown): string {
  const raw = typeof name === "string" ? name : ""
  return cleanCatalogRouteName(raw) || raw.trim()
}

function publicAtlasRoute(route: AtlasListingInput, art: AtlasRouteArt | undefined): PublicAtlasRoute {
  const durationMinutes = knownDurationMinutes(route.durationMinutes)
  return {
    id: route.id,
    name: displayName(route.name),
    distanceMiles: route.distanceMiles,
    durationMinutes,
    twistiness: route.twistiness,
    turnCount: route.turnCount,
    sourceProject: route.sourceProject,
    ...(route.profile ? { profile: route.profile } : {}),
    story: buildRouteStory({ ...route, durationMinutes }),
    art: Boolean(art),
    area: classifyCatalogArea(art?.bbox),
    ...(route.duplicateFamilyId ? { duplicateFamilyId: route.duplicateFamilyId } : {}),
    ...(typeof route.duplicateFamilySize === "number" ? { duplicateFamilySize: route.duplicateFamilySize } : {}),
    ...(route.duplicateFamilyRole ? { duplicateFamilyRole: route.duplicateFamilyRole } : {}),
    ...(art?.duplicateOf ? { duplicateOf: art.duplicateOf } : {}),
    ...(art?.bbox ? { bbox: art.bbox } : {})
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
 * Shared Route Library catalog. The listing is lightweight summary + filing
 * metadata; the `?id=` detail is the allow-listed full route record plus story,
 * poster, and truthful catalog presentation.
 */
export async function handleGpxCatalogRequest(request: Request, catalogRoot: string): Promise<Response> {
  try {
    const manifest = await readJsonCached(
      path.join(catalogRoot, "manifest.json")
    ) as import("@/lib/gpx/catalog").ProjectGpxCatalog & { routes: AtlasListingInput[] }
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
        routes: manifest.routes.map((route) => publicAtlasRoute(route, atlasArt[route.id]))
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
      ascentMeters?: unknown
      geometry?: unknown
    }

    if ("gpxIntelligence" in route && !isGpxIntelligenceReport(route.gpxIntelligence)) {
      return json({ error: { code: "GPX_CATALOG_UNAVAILABLE", message: "The imported GPX intelligence report is invalid." } }, 503)
    }

    // Detail payload: the allow-listed public record plus atlas story and art.
    // `durationMinutes` stays the stored number so the record remains a valid
    // PlannedRoute; `catalog.durationMinutes` is the truthful nullable value
    // every rider-facing surface must use.
    const art = atlasArt[route.id ?? ""]
    const durationMinutes = knownDurationMinutes(route.durationMinutes)
    const summaryInput = {
      id: String(route.id ?? requestedId),
      name: String(route.name ?? ""),
      distanceMiles: Number(route.distanceMiles ?? 0),
      durationMinutes,
      twistiness: Number(route.twistiness ?? 0),
      turnCount: Number(route.turnCount ?? 0),
      ascentMeters: typeof route.ascentMeters === "number" ? route.ascentMeters : null
    }
    const publicRoute = pickPublicDetailFields(route)
    const detail = {
      ...publicRoute,
      ...("name" in publicRoute ? { name: displayName(route.name) } : {}),
      story: buildRouteStory(summaryInput),
      catalog: { durationMinutes, area: classifyCatalogArea(art?.bbox) },
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
