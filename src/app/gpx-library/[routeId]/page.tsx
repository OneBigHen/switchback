import Link from "next/link"
import { notFound } from "next/navigation"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { ProjectGpxCatalog } from "@/lib/gpx/catalog"
import { curvatureBand, readAtlasArt } from "@/lib/gpx/atlas"
import { buildPosterSpec } from "@/lib/gpx/poster"
import { buildRouteStory } from "@/lib/gpx/route-story"
import type { Coordinate } from "@/lib/routing/types"

export const dynamic = "force-dynamic"

interface AtlasDetailRoute {
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  sourceProject?: string
  profile?: string | null
  ascentMeters?: number | null
  descentMeters?: number | null
  routingSource?: string | null
  previewOnly?: boolean
  geometry?: Coordinate[]
  story?: {
    title: string
    summary: string
    body: string
    tone: string
  }
}

interface DetailLoad {
  route: AtlasDetailRoute | null
  artPaths: Array<{ band: string; d: string }>
  start?: [number, number]
  end?: [number, number]
}

async function loadRouteDetail(routeId: string): Promise<DetailLoad> {
  const root = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
  try {
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")) as ProjectGpxCatalog
    if (!manifest.routes.some((entry) => entry.id === routeId)) return { route: null, artPaths: [] }
    const route = JSON.parse(
      await readFile(path.join(root, "routes", `${routeId}.json`), "utf8")
    ) as AtlasDetailRoute
    const art = (await readAtlasArt())[routeId]
    return {
      route,
      artPaths: art?.paths ?? [],
      start: art?.start,
      end: art?.end
    }
  } catch {
    return { route: null, artPaths: [] }
  }
}

export async function generateMetadata({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params
  const { route } = await loadRouteDetail(routeId)
  if (!route) return { title: "Route not found — Switchback" }
  return {
    title: `${route.story?.title ?? route.name} — Switchback route atlas`,
    description: route.story?.summary ?? undefined
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

export default async function RouteAtlasPosterPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params
  if (routeId.length > 200 || !/^[A-Za-z0-9._-]+$/.test(routeId)) notFound()
  const { route, artPaths, start, end } = await loadRouteDetail(routeId)
  if (!route) notFound()

  // Server-side poster build straight from geometry; atlas.json paths are the
  // fast path for the gallery, this is the full-fidelity version.
  const spec = Array.isArray(route.geometry) && route.geometry.length > 1
    ? buildPosterSpec(route.geometry as Coordinate[], { width: 600, height: 750, padding: 44 })
    : null

  const story = buildRouteStory({
    id: route.id,
    name: route.name,
    distanceMiles: route.distanceMiles,
    durationMinutes: route.durationMinutes,
    twistiness: route.twistiness,
    turnCount: route.turnCount,
    ascentMeters: route.ascentMeters
  })
  const band = curvatureBand(route.twistiness)

  return (
    <main className="atlas-page atlas-poster-page">
      <nav className="atlas-back" aria-label="Breadcrumb">
        <Link href="/gpx-library">← Route atlas</Link>
      </nav>
      <div className="atlas-poster-layout">
        <figure
          className={`atlas-poster atlas-poster--large tone-${story.tone.toLowerCase().replace(/[^a-z]+/g, "-")}`}
        >
          {spec ? (
            <svg viewBox="0 0 600 750" role="img" aria-label={`Poster map of ${route.name || "imported ride"}`}>
              <rect x="0.5" y="0.5" width="599" height="749" rx="14" className="atlas-frame" />
              {spec.segments.map((segment, index) => (
                <path key={index} d={segment.path} className={`band-${curvatureBand(segment.curvature)}`} />
              ))}
              {spec ? (
                <>
                  <circle cx={spec.start.x} cy={spec.start.y} r="5" className="atlas-marker-start" />
                  <circle cx={spec.end.x} cy={spec.end.y} r="5" className="atlas-marker-end" />
                </>
              ) : null}
            </svg>
          ) : artPaths.length > 0 ? (
            <svg viewBox="0 0 100 125" role="img" aria-label={`Poster map of ${route.name || "imported ride"}`}>
              {artPaths.map((piece, index) => (
                <path key={index} d={piece.d} className={`band-${piece.band}`} />
              ))}
              {start ? <circle cx={start[0]} cy={start[1]} r="1.6" className="atlas-marker-start" /> : null}
              {end ? <circle cx={end[0]} cy={end[1]} r="1.6" className="atlas-marker-end" /> : null}
            </svg>
          ) : (
            <figcaption className="atlas-poster-missing">No drawable geometry was imported for this route.</figcaption>
          )}
          <figcaption className="atlas-poster-caption">
            {route.name || "Imported ride"} · drawn from its own GPX geometry
          </figcaption>
        </figure>

        <section className="atlas-story" aria-label="Route description">
          <p className="atlas-card-tone">{story.tone}</p>
          <h1>{story.title}</h1>
          <p className="atlas-lede">{story.summary}</p>
          <p>{story.body}</p>

          <dl className="atlas-facts">
            <div><dt>Distance</dt><dd>{formatMiles(route.distanceMiles)} mi</dd></div>
            <div><dt>Time</dt><dd>{formatDuration(route.durationMinutes)}</dd></div>
            <div><dt>Turns</dt><dd>{formatMiles(route.turnCount)}</dd></div>
            <div><dt>Twistiness</dt><dd><span className={`band-dot band-${band}`}>{band}</span></dd></div>
            {typeof route.ascentMeters === "number" && route.ascentMeters > 0 ? (
              <div><dt>Climbing</dt><dd>{formatMiles(route.ascentMeters)} m</dd></div>
            ) : null}
            {route.profile ? <div><dt>Profile</dt><dd>{route.profile}</dd></div> : null}
            {route.sourceProject ? <div><dt>Imported from</dt><dd>{route.sourceProject}</dd></div> : null}
          </dl>

          {route.previewOnly ? (
            <p className="atlas-note">This is a preview import — the full line wasn&apos;t stored.</p>
          ) : null}
          <p className="atlas-note">
            Posters are generated from the route&apos;s own geometry, prettymaps-style — color follows curvature,
            not a basemap.
          </p>
        </section>
      </div>
    </main>
  )
}
