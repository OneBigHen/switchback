import Link from "next/link"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { atlasPathColor, readAtlasArt, curvatureBand } from "@/lib/gpx/atlas"
import { buildRouteStory } from "@/lib/gpx/route-story"

export const dynamic = "force-dynamic"

interface AtlasListingRoute {
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  sourceProject: string
  profile?: string
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
  if (value.duplicateFamilyRole !== undefined && value.duplicateFamilyRole !== "canonical" && value.duplicateFamilyRole !== "near-duplicate") return false
  if (value.story === undefined) return true
  return isRecord(value.story)
    && typeof value.story.title === "string"
    && typeof value.story.summary === "string"
    && typeof value.story.tone === "string"
}

async function loadAtlasRoutes(): Promise<{ routes: AtlasListingRoute[]; generatedAt?: string }> {
  try {
    const root = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
    const parsed: unknown = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))
    if (!isRecord(parsed) || !Array.isArray(parsed.routes)) return { routes: [] }
    return {
      routes: parsed.routes.filter(isAtlasListingRoute),
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : undefined
    }
  } catch {
    return { routes: [] }
  }
}

function formatMiles(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))
}

function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

function formatUpdated(value: string | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : `Library updated ${date.toLocaleDateString("en-US", { dateStyle: "long" })}`
}

export default async function GpxLibraryAtlasPage() {
  const { routes, generatedAt } = await loadAtlasRoutes()
  const art = await readAtlasArt()
  const updatedLabel = formatUpdated(generatedAt)

  // Poster wall: one poster per ride. Geometry-identical re-imports and
  // near-duplicate variants fold into their canonical poster.
  const hiddenDuplicates = routes.filter(
    (route) => route.duplicateFamilyRole === "near-duplicate" || art[route.id]?.duplicateOf
  ).length
  const ordered = routes
    .filter((route) => route.duplicateFamilyRole !== "near-duplicate" && !art[route.id]?.duplicateOf)
    .sort((a, b) => b.distanceMiles - a.distanceMiles)
  const collectionCopy = buildAtlasCollectionCopy({
    importedVariants: routes.length,
    uniquePosters: ordered.length,
    foldedVariants: hiddenDuplicates
  })

  return (
    <main className="atlas-page">
      <nav className="atlas-context" aria-label="Library context">
        <Link href="/">Back to planner</Link>
        <span aria-current="page">Library / Route atlas</span>
      </nav>
      <header className="atlas-hero">
        <p className="atlas-eyebrow">Route atlas</p>
        <h1>Unique route posters.</h1>
        <p className="atlas-lede">
          {collectionCopy} Each poster is redrawn from its route geometry — color follows the corners,
          and every poster carries an honest summary of the ride. Inspired by prettymaps; built from Switchback
          catalog data.
        </p>
        {updatedLabel ? <p className="atlas-updated">{updatedLabel}</p> : null}
        <p className="atlas-legend" aria-label="Curvature color legend">
          <span className="atlas-legend-ramp" aria-hidden="true" />
          calm → hairpin
        </p>
      </header>

      {ordered.length === 0 ? (
        <section className="atlas-empty">
          <strong>The atlas is empty.</strong>
          <p>Import project GPX routes with <code>npm run gpx:import-projects</code>, then regenerate poster art.</p>
        </section>
      ) : (
        <ul className="atlas-grid">
          {ordered.map((route) => {
            const routeArt = art[route.id]
            const story = buildRouteStory(route)
            return (
              <li className="atlas-card" key={route.id}>
                <Link href={`/gpx-library/${route.id}`} className="atlas-card-link" aria-label={`${story.title} — open route poster`}>
                  <span className={`atlas-poster tone-${story.tone.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                    {routeArt ? (
                      <svg viewBox="0 0 100 125" role="img" aria-label={`Poster map of ${route.name}`} preserveAspectRatio="xMidYMid meet">
                        {routeArt.paths.map((piece, index) => (
                          <path key={index} d={piece.d} style={{ color: atlasPathColor(piece) }} />
                        ))}
                        {routeArt.start ? <circle cx={routeArt.start[0]} cy={routeArt.start[1]} r="1.7" className="atlas-marker-start" /> : null}
                        {routeArt.end ? <circle cx={routeArt.end[0]} cy={routeArt.end[1]} r="1.7" className="atlas-marker-end" /> : null}
                      </svg>
                    ) : (
                      <span className="atlas-poster-fallback">
                        <strong>Poster preview unavailable</strong>
                        <small>{formatMiles(route.distanceMiles)} mi · geometry not retained</small>
                      </span>
                    )}
                    <span className="atlas-poster-caption" aria-hidden="true">
                      <strong>{story.title}</strong>
                      <span>{formatMiles(route.distanceMiles)} MI</span>
                    </span>
                  </span>
                  <span className="atlas-card-body">
                    <span className="atlas-card-tone">{story.tone}</span>
                    <strong className="atlas-card-title">{story.title}</strong>
                    <span className="atlas-card-summary">{story.summary}</span>
                    <span className="atlas-card-stats">
                      <em>{formatMiles(route.distanceMiles)} mi</em>
                      <em>{formatDuration(route.durationMinutes)}</em>
                      <em>{route.turnCount > 0 ? `${formatMiles(route.turnCount)} turns` : null}</em>
                      <em className={`band-dot band-${curvatureBand(route.twistiness)}`}>{curvatureBand(route.twistiness)}</em>
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
