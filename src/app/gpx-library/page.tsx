import Link from "next/link"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { ProjectGpxCatalog } from "@/lib/gpx/catalog"
import { readAtlasArt, curvatureBand } from "@/lib/gpx/atlas"
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

async function loadAtlasRoutes(): Promise<{ routes: AtlasListingRoute[]; generatedAt?: string }> {
  try {
    const root = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as ProjectGpxCatalog & {
      routes: AtlasListingRoute[]
    }
    return { routes: manifest.routes, generatedAt: manifest.generatedAt }
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

export default async function GpxLibraryAtlasPage() {
  const { routes, generatedAt } = await loadAtlasRoutes()
  const art = await readAtlasArt()

  // Poster wall: one poster per ride. Geometry-identical re-imports and
  // near-duplicate variants fold into their canonical poster.
  const hiddenDuplicates = routes.filter(
    (route) => route.duplicateFamilyRole === "near-duplicate" || art[route.id]?.duplicateOf
  ).length
  const ordered = routes
    .filter((route) => route.duplicateFamilyRole !== "near-duplicate" && !art[route.id]?.duplicateOf)
    .sort((a, b) => b.distanceMiles - a.distanceMiles)

  return (
    <main className="atlas-page">
      <header className="atlas-hero">
        <p className="atlas-eyebrow">Route atlas</p>
        <h1>Every ride in the library, drawn as a poster.</h1>
        <p className="atlas-lede">
          {ordered.length} imported GPX routes, each redrawn from its own geometry — color follows the corners,
          and every poster carries an honest summary of the ride. Inspired by prettymaps; built from Switchback
          catalog data.{hiddenDuplicates > 0 ? ` ${hiddenDuplicates} near-duplicate variants are folded into their canonical posters.` : ""}
        </p>
        {generatedAt ? <p className="atlas-updated">Library updated {new Date(generatedAt).toLocaleDateString("en-US", { dateStyle: "long" })}</p> : null}
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
                          <path key={index} d={piece.d} className={`band-${piece.band}`} />
                        ))}
                        {routeArt.start ? <circle cx={routeArt.start[0]} cy={routeArt.start[1]} r="1.6" className="atlas-marker-start" /> : null}
                        {routeArt.end ? <circle cx={routeArt.end[0]} cy={routeArt.end[1]} r="1.6" className="atlas-marker-end" /> : null}
                      </svg>
                    ) : (
                      <span className="atlas-poster-fallback" aria-hidden="true">{formatMiles(route.distanceMiles)}<small>mi</small></span>
                    )}
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
