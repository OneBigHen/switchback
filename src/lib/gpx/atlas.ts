import { readFile } from "node:fs/promises"
import path from "node:path"

/** Shared constants + types for the route atlas (poster gallery) and its API. */

export const ATLAS_VIEWBOX = { width: 100, height: 125 }
export const ATLAS_PADDING = 8

export type CurvatureBand = "calm" | "mellow" | "twisty" | "hairpin"

export interface AtlasMiniPath {
  band: CurvatureBand
  /** SVG path data in ATLAS_VIEWBOX coordinates. */
  d: string
}

/** Precomputed poster art for one route, stored in data/gpx-library/atlas.json. */
export interface AtlasRouteArt {
  /** Width/height of the route's Mercator bounding shape (for card framing). */
  aspect?: number
  /** Curvature-colored path pieces, ordered along the route. */
  paths: AtlasMiniPath[]
  /** Start marker position in viewbox units. */
  start?: [number, number]
  /** End marker position in viewbox units. */
  end?: [number, number]
  /** Set when this route is a geometry-identical re-import of another route. */
  duplicateOf?: string
}

export interface AtlasFile {
  version?: number
  routes?: Record<string, AtlasRouteArt>
}

export function curvatureBand(value: number): CurvatureBand {
  if (value >= 65) return "hairpin"
  if (value >= 45) return "twisty"
  if (value >= 22) return "mellow"
  return "calm"
}

/** Resolve the on-disk GPX library root (shared with the catalog API route). */
export function gpxLibraryRoot(): string {
  return process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
}

/** Load the precomputed atlas art; missing or broken file means "no art", never a crash. */
export async function readAtlasArt(root: string = gpxLibraryRoot()): Promise<Record<string, AtlasRouteArt>> {
  try {
    const parsed = JSON.parse(await readFile(path.join(root, "atlas.json"), "utf8")) as AtlasFile
    return parsed.routes ?? {}
  } catch {
    return {}
  }
}
