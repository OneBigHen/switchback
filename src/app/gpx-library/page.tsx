import type { Metadata } from "next"
import Link from "next/link"
import path from "node:path"
import { readDerivedCached } from "@/lib/gpx/catalog-cache"
import { curvatureBand, readAtlasArt } from "@/lib/gpx/atlas"
import type { AtlasRouteArt } from "@/lib/gpx/atlas"
import { buildRouteStory } from "@/lib/gpx/route-story"
import { isAtlasPageOverBudget } from "@/lib/gpx/atlas-page-guard"
import { AtlasBrowser } from "./AtlasBrowser"
import { classifyRegion, type AtlasBrowseRoute } from "./atlas-browse"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Route atlas",
  description: "Every ride imported into Switchback, drawn from its own GPS line — browse the collection by what is closest to you, how far it goes and how hard it corners."
}

interface AtlasListingRoute {
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  sourceProject: string
  profile?: string
  duplicateFamilyId?: string
  duplicateFamilyRole?: "canonical" | "near-duplicate"
  story?: {
    title: string
    summary: string
    tone: string
  }
}

export interface AtlasCollectionCopyCounts {
  importedVariants: number
  uniquePosters: number
  foldedVariants: number
}

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

/**
 * Plain-language summary of how many imported variants folded into how many
 * distinct route shapes. Retained for `tests/unit/atlas-copy.test.ts`; the V2
 * browser header does not currently surface it.
 */
export function buildAtlasCollectionCopy({
  importedVariants,
  uniquePosters,
  foldedVariants
}: AtlasCollectionCopyCounts): string {
  const summary = `${countLabel(uniquePosters, "unique route poster")} from ${countLabel(importedVariants, "imported route variant")}.`
  return foldedVariants > 0
    ? `${summary} ${countLabel(foldedVariants, "imported variant")} share${foldedVariants === 1 ? "s" : ""} a route shape and ${foldedVariants === 1 ? "is" : "are"} folded into these posters.`
    : summary
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
  if (value.duplicateFamilyRole !== undefined && value.duplicateFamilyRole !== "canonical" && value.duplicateFamilyRole !== "near-duplicate") return false
  if (value.story === undefined) return true
  return isRecord(value.story)
    && typeof value.story.title === "string"
    && typeof value.story.summary === "string"
    && typeof value.story.tone === "string"
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

/** Fold one manifest row + its poster art into the shape the browser UI wants. */
function toBrowseRoute(route: AtlasListingRoute, art: AtlasRouteArt | undefined): AtlasBrowseRoute {
  const story = buildRouteStory(route)
  const bbox = art?.bbox ?? null
  return {
    id: route.id,
    name: route.name,
    title: story.title,
    tone: story.tone,
    band: curvatureBand(route.twistiness),
    distanceMiles: route.distanceMiles,
    durationMinutes: route.durationMinutes,
    turnCount: route.turnCount,
    twistiness: route.twistiness,
    // The public listing carries no surface mix; the field stays wired for when
    // the importer starts persisting it.
    unpavedShare: null,
    bbox,
    region: classifyRegion(bbox),
    aspect: typeof art?.aspect === "number" && art.aspect > 0 ? art.aspect : 1,
    paths: art ? art.paths.map((piece) => piece.d) : [],
    start: art?.start ?? null,
    end: art?.end ?? null
  }
}

export default async function GpxLibraryAtlasPage() {
  if (await isAtlasPageOverBudget()) {
    return (
      <main className="atlas-page">
        <nav className="atlas-context" aria-label="Library context">
          <Link href="/">Back to planner</Link>
          <span aria-current="page">Library / Route atlas</span>
        </nav>
        <p className="atlas-empty">
          <strong>Too many atlas requests from this address.</strong>
          <span>Give it a minute and reload.</span>
        </p>
      </main>
    )
  }

  const [{ routes, generatedAt }, art] = await Promise.all([loadAtlasRoutes(), readAtlasArt()])

  // One card per ride, not per import. Two passes fold repeats: the atlas
  // builder marks geometry-identical re-imports with `duplicateOf`, and the
  // importer groups near-identical tracks into `duplicateFamilyId` families —
  // keep that family's canonical (or its longest track when none is flagged).
  const drawable = routes.filter((route) => art[route.id] && !art[route.id]?.duplicateOf)
  const familyPick = new Map<string, AtlasListingRoute>()
  for (const route of drawable) {
    if (!route.duplicateFamilyId) continue
    const held = familyPick.get(route.duplicateFamilyId)
    if (!held) { familyPick.set(route.duplicateFamilyId, route); continue }
    const heldCanonical = held.duplicateFamilyRole === "canonical"
    const routeCanonical = route.duplicateFamilyRole === "canonical"
    if (routeCanonical && !heldCanonical) familyPick.set(route.duplicateFamilyId, route)
    else if (routeCanonical === heldCanonical && route.distanceMiles > held.distanceMiles) {
      familyPick.set(route.duplicateFamilyId, route)
    }
  }
  const browseRoutes = drawable
    .filter((route) => !route.duplicateFamilyId || familyPick.get(route.duplicateFamilyId)?.id === route.id)
    .map((route) => toBrowseRoute(route, art[route.id]))

  // Bulk imports name several genuinely different rides identically ("… Loops",
  // "Huntington Motor Inn Connector"). When a title repeats, tag each with its
  // distance so the cards stay tellable apart.
  const titleTally = new Map<string, number>()
  for (const route of browseRoutes) titleTally.set(route.title, (titleTally.get(route.title) ?? 0) + 1)
  const disambiguated: AtlasBrowseRoute[] = browseRoutes.map((route) =>
    (titleTally.get(route.title) ?? 0) > 1
      ? { ...route, title: `${route.title} · ${Math.round(route.distanceMiles)} mi` }
      : route
  )

  const regions = [...new Set(disambiguated.map((route) => route.region).filter((region): region is string => region !== null))]
    .sort((a, b) => a.localeCompare(b))
  const totalMiles = disambiguated.reduce((sum, route) => sum + route.distanceMiles, 0)
  const updatedLabel = formatUpdated(generatedAt)

  return (
    <main className="atlas-page">
      <nav className="atlas-context" aria-label="Library context">
        <Link href="/">Back to planner</Link>
        <span aria-current="page">Library / Route atlas</span>
      </nav>

      <header className="atlas-head">
        <h1>Route atlas</h1>
        <p className="atlas-lede">
          Every ride imported into Switchback, drawn from its own GPS line. Start with the roads closest to
          you, then narrow by how far you want to go and how hard you want to work.
        </p>
      </header>

      {disambiguated.length === 0 ? (
        <section className="atlas-empty">
          <strong>The atlas is empty.</strong>
          <p>Import project GPX routes with <code>npm run gpx:import-projects</code>, then run <code>npm run atlas:build</code> to draw the lines.</p>
        </section>
      ) : (
        <AtlasBrowser
          routes={disambiguated}
          regions={regions}
          routeCount={disambiguated.length}
          totalMiles={totalMiles}
          updatedLabel={updatedLabel}
        />
      )}
    </main>
  )
}
