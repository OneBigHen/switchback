import type { Metadata } from "next"
import Link from "next/link"
import path from "node:path"
import { PRODUCT_BRAND } from "@/lib/brand/product-brand"
import { readDerivedCached } from "@/lib/gpx/catalog-cache"
import { readAtlasArt } from "@/lib/gpx/atlas"
import { isAtlasPageOverBudget } from "@/lib/gpx/atlas-page-guard"
import { AtlasBrowser } from "./AtlasBrowser"
import { buildAtlasBrowseRoutes, type AtlasListingRoute } from "./atlas-listing"

export const dynamic = "force-dynamic"

const ROUTE_LIBRARY_LEDE = "Find roads worth riding — browse the shared collection by what is near you, how long you want to ride, and how twisty you want it."

export const metadata: Metadata = {
  title: `Route Library — ${PRODUCT_BRAND.name}`,
  description: ROUTE_LIBRARY_LEDE
}

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

/**
 * The manifest is hundreds of kilobytes and this page is public and
 * uncacheable, so the parse and the per-route validation are memoised against
 * the file's mtime rather than repeated per request.
 */
async function loadAtlasRoutes(): Promise<{ routes: AtlasListingRoute[]; generatedAt?: string }> {
  try {
    const root = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
    return await readDerivedCached(path.join(root, "manifest.json"), "atlas-listing", validateAtlasListing)
  } catch {
    return { routes: [] }
  }
}

function formatUpdated(value: string | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : `Updated ${date.toLocaleDateString("en-US", { dateStyle: "medium" })}`
}

export default async function GpxLibraryAtlasPage() {
  if (await isAtlasPageOverBudget()) {
    return (
      <main className="atlas-page">
        <nav className="atlas-context" aria-label="Route Library context">
          <Link href="/">Back to planner</Link>
          <span aria-current="page">Route Library</span>
        </nav>
        <p className="atlas-empty">
          <strong>Too many Route Library requests from this address.</strong>
          <span>Give it a minute and reload.</span>
        </p>
      </main>
    )
  }

  const [{ routes, generatedAt }, art] = await Promise.all([loadAtlasRoutes(), readAtlasArt()])
  const browseRoutes = buildAtlasBrowseRoutes(routes, art)

  const regions = [...new Set(browseRoutes.map((route) => route.region).filter((region): region is string => region !== null))]
    .sort((a, b) => a.localeCompare(b))
  const ridingAreas = [...new Set(browseRoutes.flatMap((route) => route.ridingAreas))]
    .sort((a, b) => a.localeCompare(b))
  const totalMiles = browseRoutes.reduce((sum, route) => sum + route.distanceMiles, 0)
  const updatedLabel = formatUpdated(generatedAt)

  return (
    <main className="atlas-page">
      <nav className="atlas-context" aria-label="Route Library context">
        <Link href="/">Back to planner</Link>
        <Link href="/?tab=rides">My Rides</Link>
        <span aria-current="page">Route Library</span>
      </nav>

      <header className="atlas-head">
        <h1>Route Library</h1>
        <p className="atlas-lede">{ROUTE_LIBRARY_LEDE}</p>
      </header>

      {browseRoutes.length === 0 ? (
        <section className="atlas-empty">
          <strong>The Route Library is empty.</strong>
          <p>Import project GPX routes with <code>npm run gpx:import-projects</code>, then run <code>npm run atlas:build</code> to draw the lines.</p>
        </section>
      ) : (
        <AtlasBrowser
          routes={browseRoutes}
          regions={regions}
          ridingAreas={ridingAreas}
          routeCount={browseRoutes.length}
          totalMiles={totalMiles}
          updatedLabel={updatedLabel}
        />
      )}
    </main>
  )
}
