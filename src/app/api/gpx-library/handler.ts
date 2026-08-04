import { readFile } from "node:fs/promises"
import path from "node:path"
import type { ProjectGpxCatalog, ProjectGpxRouteSummary } from "@/lib/gpx/catalog"

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, max-age=60" }
  })
}

/**
 * Strip filesystem details from the public catalog. `sourceFile`/`sources`
 * contain absolute and relative paths from the host (e.g. `/root/Vibe/...`)
 * that must not be visible to anonymous visitors.
 */
function publicCatalogRoutes(routes: ProjectGpxRouteSummary[]): Array<{
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  sourceProject: string
}> {
  return routes.map((route) => ({
    id: route.id,
    name: route.name,
    distanceMiles: route.distanceMiles,
    durationMinutes: route.durationMinutes,
    twistiness: route.twistiness,
    turnCount: route.turnCount,
    sourceProject: route.sourceProject
  }))
}

export async function handleGpxCatalogRequest(request: Request, catalogRoot: string): Promise<Response> {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(catalogRoot, "manifest.json"), "utf8")
    ) as ProjectGpxCatalog
    const requestedId = new URL(request.url).searchParams.get("id")
    if (!requestedId) {
      return json({
        generatedAt: manifest.generatedAt,
        scannedFiles: manifest.scannedFiles ?? 0,
        duplicateFiles: manifest.duplicateFiles ?? 0,
        uniqueFiles: manifest.uniqueFiles ?? manifest.routes.length,
        importedRoutes: manifest.importedRoutes ?? manifest.routes.length,
        rejectedFiles: manifest.rejectedFiles ?? 0,
        routes: publicCatalogRoutes(manifest.routes)
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
    ) as unknown
    return json(route)
  } catch {
    return json({
      error: {
        code: "GPX_CATALOG_UNAVAILABLE",
        message: "The project GPX library is not available."
      }
    }, 503)
  }
}
