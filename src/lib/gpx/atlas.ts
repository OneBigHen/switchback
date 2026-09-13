import path from "node:path"
import { readDerivedCached } from "@/lib/gpx/catalog-cache"
import {
  isAtlasRecord,
  parseRouteArt,
  type AtlasRouteArt
} from "./atlas-art"

/** Server-side atlas access. The pure art model lives in `atlas-art.ts`. */
export * from "./atlas-art"

/** Resolve the on-disk GPX library root (shared with the catalog API route). */
export function gpxLibraryRoot(): string {
  return process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
}

function validateAtlasArt(parsed: unknown): Record<string, AtlasRouteArt> {
  if (!isAtlasRecord(parsed) || !isAtlasRecord(parsed.routes)) return {}
  return Object.entries(parsed.routes).reduce<Record<string, AtlasRouteArt>>((validRoutes, [id, value]) => {
    const routeArt = parseRouteArt(value)
    if (routeArt) validRoutes[id] = routeArt
    return validRoutes
  }, {})
}

/**
 * Load the precomputed atlas art; missing or broken file means "no art", never
 * a crash. The parse and the per-route validation are both memoised against
 * the file's mtime — this runs on every public Atlas page view.
 */
export async function readAtlasArt(root: string = gpxLibraryRoot()): Promise<Record<string, AtlasRouteArt>> {
  try {
    return await readDerivedCached(path.join(root, "atlas.json"), "atlas-art", validateAtlasArt)
  } catch {
    return {}
  }
}
