import { readFile } from "node:fs/promises"
import path from "node:path"

/** Shared constants + types for the route atlas (poster gallery) and its API. */

export const ATLAS_VIEWBOX = { width: 100, height: 125 }
export const ATLAS_PADDING = 8

export type CurvatureBand = "calm" | "mellow" | "twisty" | "hairpin"

export const CURVATURE_RAMP = [
  { at: 0, color: "#5c7c99" },
  { at: 0.35, color: "#3e8f7a" },
  { at: 0.6, color: "#e3b23c" },
  { at: 0.8, color: "#e07a2e" },
  { at: 1, color: "#d84f4f" }
] as const

const CURVATURE_BANDS = ["calm", "mellow", "twisty", "hairpin"] as const
const CURVATURE_BAND_SET: ReadonlySet<string> = new Set(CURVATURE_BANDS)

const BAND_HEAT: Readonly<Record<CurvatureBand, number>> = {
  calm: 0.125,
  mellow: 0.425,
  twisty: 0.675,
  hairpin: 0.875
}

export interface AtlasMiniPath {
  readonly band: CurvatureBand
  readonly heat?: number
  readonly color?: string
  /** SVG path data in ATLAS_VIEWBOX coordinates. */
  readonly d: string
}

/** Precomputed poster art for one route, stored in data/gpx-library/atlas.json. */
export interface AtlasRouteArt {
  /** Width/height of the route's Mercator bounding shape (for card framing). */
  readonly aspect?: number
  /** Curvature-colored path pieces, ordered along the route. */
  readonly paths: readonly AtlasMiniPath[]
  /** Start marker position in viewbox units. */
  readonly start?: readonly [number, number]
  /** End marker position in viewbox units. */
  readonly end?: readonly [number, number]
  /** Set when this route is a geometry-identical re-import of another route. */
  readonly duplicateOf?: string
}

function clampRampPosition(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function rgbChannel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16)
}

export function curvatureRampColor(value: number): string {
  const position = Number.isFinite(value) ? clampRampPosition(value) : 0
  for (let index = 1; index < CURVATURE_RAMP.length; index += 1) {
    const previous = CURVATURE_RAMP[index - 1]
    const next = CURVATURE_RAMP[index]
    if (previous && next && position <= next.at) {
      const progress = (position - previous.at) / (next.at - previous.at)
      const channels = [1, 3, 5].map((offset) => Math.round(
        rgbChannel(previous.color, offset) + (rgbChannel(next.color, offset) - rgbChannel(previous.color, offset)) * progress
      ))
      return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
    }
  }
  return CURVATURE_RAMP[CURVATURE_RAMP.length - 1]?.color ?? "#d84f4f"
}

export interface AtlasFile {
  readonly version?: number
  readonly routes?: Record<string, AtlasRouteArt>
}

export function curvatureBand(value: number): CurvatureBand {
  if (value >= 65) return "hairpin"
  if (value >= 45) return "twisty"
  if (value >= 22) return "mellow"
  return "calm"
}

export function atlasPathColor(path: Pick<AtlasMiniPath, "band" | "heat">): string {
  const fallbackHeat = BAND_HEAT[path.band] ?? BAND_HEAT.calm
  const heat = typeof path.heat === "number" && Number.isFinite(path.heat) ? path.heat : fallbackHeat
  return curvatureRampColor(heat)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPoint(value: unknown): value is readonly [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && Number.isFinite(value[0])
    && typeof value[1] === "number"
    && Number.isFinite(value[1])
}

function isBand(value: unknown): value is CurvatureBand {
  return typeof value === "string" && CURVATURE_BAND_SET.has(value)
}

function isMiniPath(value: unknown): value is AtlasMiniPath {
  if (!isRecord(value) || typeof value.d !== "string" || value.d.length === 0 || !isBand(value.band)) return false
  if (value.heat !== undefined && (typeof value.heat !== "number" || !Number.isFinite(value.heat))) return false
  return value.color === undefined || typeof value.color === "string"
}

function parseRouteArt(value: unknown): AtlasRouteArt | null {
  if (!isRecord(value) || !Array.isArray(value.paths) || value.paths.length === 0) return null
  if (!value.paths.every(isMiniPath)) return null
  if (value.aspect !== undefined && (typeof value.aspect !== "number" || !Number.isFinite(value.aspect))) return null
  if (value.start !== undefined && !isPoint(value.start)) return null
  if (value.end !== undefined && !isPoint(value.end)) return null
  if (value.duplicateOf !== undefined && typeof value.duplicateOf !== "string") return null
  return {
    paths: value.paths,
    ...(typeof value.aspect === "number" ? { aspect: value.aspect } : {}),
    ...(isPoint(value.start) ? { start: value.start } : {}),
    ...(isPoint(value.end) ? { end: value.end } : {}),
    ...(typeof value.duplicateOf === "string" ? { duplicateOf: value.duplicateOf } : {})
  }
}

/** Resolve the on-disk GPX library root (shared with the catalog API route). */
export function gpxLibraryRoot(): string {
  return process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
}

/** Load the precomputed atlas art; missing or broken file means "no art", never a crash. */
export async function readAtlasArt(root: string = gpxLibraryRoot()): Promise<Record<string, AtlasRouteArt>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path.join(root, "atlas.json"), "utf8"))
    if (!isRecord(parsed) || !isRecord(parsed.routes)) return {}
    return Object.entries(parsed.routes).reduce<Record<string, AtlasRouteArt>>((validRoutes, [id, value]) => {
      const routeArt = parseRouteArt(value)
      if (routeArt) validRoutes[id] = routeArt
      return validRoutes
    }, {})
  } catch {
    return {}
  }
}
