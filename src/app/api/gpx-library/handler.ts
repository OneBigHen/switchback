import { readFile } from "node:fs/promises"
import path from "node:path"
import type { ProjectGpxCatalog } from "@/lib/gpx/catalog"

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, max-age=60" }
  })
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
        routes: manifest.routes
      })
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
