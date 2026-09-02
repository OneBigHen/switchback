import { cache } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import path from "node:path"
import { readJsonCached } from "@/lib/gpx/catalog-cache"
import { atlasPathColor, curvatureBand, readAtlasArt, type AtlasMiniPath } from "@/lib/gpx/atlas"
import { buildPosterSpec } from "@/lib/gpx/poster"
import { buildRouteStory } from "@/lib/gpx/route-story"
import { isAtlasPageOverBudget } from "@/lib/gpx/atlas-page-guard"
import { isGpxIntelligenceReport, type GpxIntelligenceReport } from "@/lib/gpx/intelligence"
import { GpxIntelligencePanel } from "@/components/planner/GpxIntelligencePanel"
import type { Coordinate } from "@/lib/routing/types"

export const dynamic = "force-dynamic"

type SurfaceMix = Record<string, number>

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
  roadMix?: SurfaceMix
  surfaceMix?: SurfaceMix
  gpxIntelligence?: GpxIntelligenceReport
  story?: {
    title: string
    summary: string
    body: string
    tone: string
  }
}

interface DetailLoad {
  route: AtlasDetailRoute | null
  artPaths: readonly AtlasMiniPath[]
  start?: readonly [number, number]
  end?: readonly [number, number]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value)
    && value.length === 2
    && isFiniteNumber(value[0])
    && isFiniteNumber(value[1])
}

function isSurfaceMix(value: unknown): value is SurfaceMix {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry))
}

function isDetailRoute(value: unknown): value is AtlasDetailRoute {
  if (!isRecord(value)) return false
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isFiniteNumber(value.distanceMiles) ||
    !isFiniteNumber(value.durationMinutes) ||
    !isFiniteNumber(value.twistiness) ||
    !isFiniteNumber(value.turnCount)
  ) return false
  if (value.sourceProject !== undefined && typeof value.sourceProject !== "string") return false
  if (value.profile !== undefined && value.profile !== null && typeof value.profile !== "string") return false
  if (value.ascentMeters !== undefined && value.ascentMeters !== null && !isFiniteNumber(value.ascentMeters)) return false
  if (value.descentMeters !== undefined && value.descentMeters !== null && !isFiniteNumber(value.descentMeters)) return false
  if (value.routingSource !== undefined && value.routingSource !== null && typeof value.routingSource !== "string") return false
  if (value.previewOnly !== undefined && typeof value.previewOnly !== "boolean") return false
  if (value.geometry !== undefined && (!Array.isArray(value.geometry) || !value.geometry.every(isCoordinate))) return false
  if (value.roadMix !== undefined && !isSurfaceMix(value.roadMix)) return false
  if (value.surfaceMix !== undefined && !isSurfaceMix(value.surfaceMix)) return false
  if (value.gpxIntelligence !== undefined && !isGpxIntelligenceReport(value.gpxIntelligence)) return false
  if (value.story === undefined) return true
  return isRecord(value.story)
    && typeof value.story.title === "string"
    && typeof value.story.summary === "string"
    && typeof value.story.body === "string"
    && typeof value.story.tone === "string"
}

function manifestHasRoute(value: unknown, routeId: string): boolean {
  return isRecord(value)
    && Array.isArray(value.routes)
    && value.routes.some((entry) => isRecord(entry) && entry.id === routeId)
}

/**
 * `cache()` so `generateMetadata` and the page body share one load per request
 * instead of each re-reading the manifest, the route record and the atlas; the
 * reads underneath are additionally memoised against each file's mtime.
 */
const loadRouteDetail = cache(async (routeId: string): Promise<DetailLoad> => {
  const root = process.env.GPX_LIBRARY_PATH ?? path.join(process.cwd(), "data/gpx-library")
  try {
    const manifest: unknown = await readJsonCached(path.join(root, "manifest.json"))
    if (!manifestHasRoute(manifest, routeId)) return { route: null, artPaths: [] }
    const parsedRoute: unknown = await readJsonCached(path.join(root, "routes", `${routeId}.json`))
    if (!isDetailRoute(parsedRoute) || parsedRoute.id !== routeId) return { route: null, artPaths: [] }
    const art = (await readAtlasArt())[routeId]
    return {
      route: parsedRoute,
      artPaths: art?.paths ?? [],
      start: art?.start,
      end: art?.end
    }
  } catch {
    return { route: null, artPaths: [] }
  }
})

export async function generateMetadata({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params
  const { route } = await loadRouteDetail(routeId)
  if (!route) return { title: "Route not found — Switchback" }
  return {
    title: `${route.story?.title ?? route.name} — Switchback route atlas`,
    description: route.story?.summary ?? undefined
  }
}

// Constructing an Intl formatter is the expensive part; build it once, as the
// listing page already does.
const WHOLE_NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

function formatMiles(value: number): string {
  return WHOLE_NUMBER.format(Math.round(value))
}

function formatDuration(minutes: number): string | null {
  const total = Math.max(0, Math.round(minutes))
  if (total <= 0) return null
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

/** Plain-language climb character from total ascent over the ride's length. */
function climbCharacter(ascentMeters: number | null | undefined, distanceMiles: number): string | null {
  if (typeof ascentMeters !== "number" || ascentMeters <= 0 || distanceMiles <= 0) return null
  const feetPerMile = (ascentMeters * 3.28084) / distanceMiles
  if (feetPerMile < 30) return "Flat — barely any climbing"
  if (feetPerMile < 70) return "Rolling — gentle grades"
  if (feetPerMile < 130) return "Hilly — steady climbing throughout"
  return "Mountainous — sustained, serious climbs"
}

function turnCharacter(turnsPerTenMiles: number): string {
  if (turnsPerTenMiles < 10) return "Open road — long straights, few decisions"
  if (turnsPerTenMiles < 30) return "A flowing mix of bends and straights"
  if (turnsPerTenMiles < 70) return "Corner after corner — steady rhythm"
  return "Relentless — technical, tight, full attention"
}

/** Prefer the measured GPX evidence, fall back to the coarse stored mix. */
function surfaceEntries(route: AtlasDetailRoute): Array<[string, number]> {
  const evidence = route.gpxIntelligence?.surface
  const source = evidence && evidence.status === "known" && Object.keys(evidence.distribution).length > 0
    ? evidence.distribution
    : route.surfaceMix
  if (!source || Object.keys(source).length === 0) return []
  const total = Object.values(source).reduce((sum, value) => sum + Math.max(0, value), 0)
  if (total <= 0) return []
  return Object.entries(source)
    .map(([name, value]): [string, number] => [name.replaceAll("_", " "), (Math.max(0, value) / total) * 100])
    .filter(([, share]) => share >= 0.5)
    .sort((left, right) => right[1] - left[1])
}

const SURFACE_TINT: Record<string, string> = {
  asphalt: "var(--sb-signal)",
  paved: "var(--sb-signal)",
  concrete: "var(--sb-slate)",
  gravel: "var(--sb-trail-brown)",
  unpaved: "var(--sb-trail-brown)",
  dirt: "var(--sb-trail-brown)",
  ground: "var(--sb-trail-brown)",
  compacted: "var(--sb-golden-hour)",
  sand: "var(--sb-golden-hour)",
  grass: "var(--sb-moss)"
}

function surfaceTint(name: string, index: number): string {
  const key = name.split(" ")[0]?.toLowerCase() ?? ""
  return SURFACE_TINT[key] ?? ["var(--sb-moss)", "var(--sb-slate)", "var(--sb-golden-hour)", "var(--sb-trail-brown)"][index % 4]!
}

export default async function RouteAtlasPosterPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params
  if (routeId.length > 200 || !/^[A-Za-z0-9._-]+$/.test(routeId)) notFound()
  if (await isAtlasPageOverBudget()) {
    return (
      <main className="atlas-page atlas-poster-page">
        <nav className="atlas-context" aria-label="Library context">
          <Link href="/gpx-library">Back to the atlas</Link>
        </nav>
        <p className="atlas-empty">
          <strong>Too many atlas requests from this address.</strong>
          <span>Give it a minute and reload.</span>
        </p>
      </main>
    )
  }
  const { route, artPaths, start, end } = await loadRouteDetail(routeId)
  if (!route) notFound()

  // Server-side poster build straight from geometry; atlas.json paths are the
  // fast path for the gallery, this is the full-fidelity version.
  const spec = Array.isArray(route.geometry) && route.geometry.length > 1
    ? buildPosterSpec(route.geometry, { width: 600, height: 750, padding: 44 })
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
  const hasDrawableGeometry = spec !== null || artPaths.length > 0
  const canOpenInPlanner = Array.isArray(route.geometry) && route.geometry.length > 1

  const timeLabel = formatDuration(route.durationMinutes)
  const turnsPerTenMiles = route.distanceMiles > 0 ? (route.turnCount / route.distanceMiles) * 10 : 0
  const ascent = typeof route.ascentMeters === "number" && route.ascentMeters > 0 ? route.ascentMeters : null
  const descent = typeof route.descentMeters === "number" && route.descentMeters > 0 ? route.descentMeters : null
  const climb = climbCharacter(ascent, route.distanceMiles)
  const surfaces = surfaceEntries(route)

  return (
    <main className="atlas-page atlas-poster-page">
      <nav className="atlas-back" aria-label="Breadcrumb">
        <Link href="/">Back to planner</Link>
        <Link href="/gpx-library">Route atlas</Link>
      </nav>
      <div className="atlas-poster-layout">
        <figure
          className={`atlas-poster atlas-poster--large tone-${story.tone.toLowerCase().replace(/[^a-z]+/g, "-")}`}
        >
          {spec ? (
            <svg viewBox="0 0 600 750" role="img" aria-label={`Poster map of ${route.name || "imported ride"}`}>
              <rect x="0.5" y="0.5" width="599" height="749" rx="14" className="atlas-frame" />
              {spec.segments.map((segment, index) => (
                <path key={index} d={segment.path} style={{ color: segment.color }} />
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
                <path key={index} d={piece.d} style={{ color: atlasPathColor(piece) }} />
              ))}
              {start ? <circle cx={start[0]} cy={start[1]} r="1.6" className="atlas-marker-start" /> : null}
              {end ? <circle cx={end[0]} cy={end[1]} r="1.6" className="atlas-marker-end" /> : null}
            </svg>
          ) : (
            <p className="atlas-poster-missing" role="status">No drawable geometry was imported for this route.</p>
          )}
          <figcaption className="atlas-poster-caption--large">
            {hasDrawableGeometry ? `${route.name || "Imported ride"} · drawn from its own GPX geometry` : "No drawable GPX geometry was retained for this import."}
          </figcaption>
        </figure>

        <section className="atlas-story" aria-label="Route description">
          <p className="atlas-card-tone">{story.tone}</p>
          <h1>{story.title}</h1>
          <p className="atlas-lede">{story.summary}</p>
          <p>{story.body}</p>

          <div className="atlas-launch">
            {canOpenInPlanner ? (
              <Link href={`/?ride=${encodeURIComponent(route.id)}`} className="atlas-launch-primary">
                Open in the planner
              </Link>
            ) : (
              <span className="atlas-launch-primary is-disabled" aria-disabled="true">Geometry not retained</span>
            )}
            <Link href="/gpx-library" className="atlas-launch-secondary">Back to the atlas</Link>
          </div>
          <p className="atlas-note">
            Opening it drops the imported line into the planner as a track — edit it, add an approach from where
            you are, or start the ride from there.
          </p>

          <dl className="atlas-facts">
            <div><dt>Distance</dt><dd>{formatMiles(route.distanceMiles)} mi</dd></div>
            {timeLabel ? <div><dt>Recorded time</dt><dd>{timeLabel}</dd></div> : null}
            <div><dt>Turns</dt><dd>{formatMiles(route.turnCount)}</dd></div>
            <div><dt>Turn density</dt><dd>{turnsPerTenMiles.toFixed(turnsPerTenMiles < 10 ? 1 : 0)} / 10 mi</dd></div>
            <div><dt>Corners</dt><dd><span className={`band-dot band-${band}`}>{band}</span></dd></div>
            {ascent ? (
              <div>
                <dt>Climb</dt>
                <dd>&uarr; {formatMiles(ascent)} m{descent ? ` · ↓ ${formatMiles(descent)} m` : ""}</dd>
              </div>
            ) : null}
            {route.profile ? <div><dt>Profile</dt><dd>{route.profile}</dd></div> : null}
            {route.sourceProject ? <div><dt>Imported from</dt><dd>{route.sourceProject}</dd></div> : null}
          </dl>

          <ul className="atlas-read">
            <li>{turnCharacter(turnsPerTenMiles)}.</li>
            {climb ? <li>{climb}.</li> : null}
          </ul>

          {surfaces.length > 0 ? (
            <div className="atlas-mix" aria-label="Surface mix">
              <p className="atlas-mix-title">Surface</p>
              <div className="atlas-mix-bar" role="img" aria-label={surfaces.map(([name, share]) => `${Math.round(share)}% ${name}`).join(", ")}>
                {surfaces.map(([name, share], index) => (
                  <span key={name} style={{ width: `${share}%`, background: surfaceTint(name, index) }} />
                ))}
              </div>
              <ul className="atlas-mix-legend">
                {surfaces.map(([name, share], index) => (
                  <li key={name}>
                    <i aria-hidden="true" style={{ background: surfaceTint(name, index) }} />
                    <span>{name}</span>
                    <em>{Math.round(share)}%</em>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="atlas-note">Surface breakdown was not recoverable from this GPX.</p>
          )}

          {route.previewOnly ? (
            <p className="atlas-note">This is a preview import — the full line wasn&apos;t stored.</p>
          ) : null}
        </section>
      </div>

      {route.gpxIntelligence ? (
        <section className="atlas-detail-report" aria-label="Measured track report">
          <GpxIntelligencePanel report={route.gpxIntelligence} />
        </section>
      ) : null}
    </main>
  )
}
