import path from "node:path"
import { readAtlasArt } from "@/lib/gpx/atlas"
import { readDerivedCached } from "@/lib/gpx/catalog-cache"
import { buildAtlasBrowseRoutes, type AtlasListingRoute } from "./atlas-listing"
import type { AtlasBrowseRoute } from "./atlas-browse"

/**
 * One loader for the browse catalog, shared by the `/gpx-library` page and the
 * `/api/route-catalog` endpoint the in-app Explore destination reads.
 *
 * Both surfaces must show the same routes with the same filing, so neither
 * gets its own copy of the manifest validation or the duplicate folding.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isAtlasListingRoute(value: unknown): value is AtlasListingRoute {
  if (!isRecord(value)) return false
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isFiniteNumber(value.distanceMiles) ||
    !isFiniteNumber(value.durationMinutes) ||
    !isFiniteNumber(value.twistiness) ||
    !isFiniteNumber(value.turnCount) ||
    typeof value.sourceProject !== "string"
  ) return false
  if (value.profile !== undefined && typeof value.profile !== "string") return false
  if (value.duplicateFamilyId !== undefined && typeof value.duplicateFamilyId !== "string") return false
  if (value.previewOnly !== undefined && typeof value.previewOnly !== "boolean") return false
  return value.duplicateFamilyRole === undefined
    || value.duplicateFamilyRole === "canonical"
    || value.duplicateFamilyRole === "near-duplicate"
}

function validateAtlasListing(parsed: unknown): { routes: AtlasListingRoute[]; generatedAt?: string } {
  if (!isRecord(parsed) || !Array.isArray(parsed.routes)) return { routes: [] }
  return {
    routes: parsed.routes.filter(isAtlasListingRoute),
    generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : undefined
  }
}

export interface BrowseCatalog {
  routes: AtlasBrowseRoute[]
  regions: string[]
  ridingAreas: string[]
  routeCount: number
  totalMiles: number
  updatedLabel: string | null
}

function formatUpdated(value: string | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : `Updated ${date.toLocaleDateString("en-US", { dateStyle: "medium" })}`
}

/**
 * The manifest is hundreds of kilobytes and these surfaces are public, so the
 * parse and the per-route validation are memoised against the file's mtime
 * rather than repeated per request.
 */
export async function loadBrowseCatalog(): Promise<BrowseCatalog> {
  const root = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
  let listing: { routes: AtlasListingRoute[]; generatedAt?: string } = { routes: [] }
  try {
    listing = await readDerivedCached(path.join(root, "manifest.json"), "atlas-listing", validateAtlasListing)
  } catch {
    listing = { routes: [] }
  }
  const art = await readAtlasArt(root)
  const routes = buildAtlasBrowseRoutes(listing.routes, art)

  return {
    routes,
    regions: [...new Set(routes.map((route) => route.region).filter((region): region is string => region !== null))]
      .sort((a, b) => a.localeCompare(b)),
    ridingAreas: [...new Set(routes.flatMap((route) => route.ridingAreas))].sort((a, b) => a.localeCompare(b)),
    routeCount: routes.length,
    totalMiles: routes.reduce((sum, route) => sum + route.distanceMiles, 0),
    updatedLabel: formatUpdated(listing.generatedAt)
  }
}
