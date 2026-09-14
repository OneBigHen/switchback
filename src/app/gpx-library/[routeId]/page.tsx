import { cache } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import path from "node:path"
import { readJsonCached } from "@/lib/gpx/catalog-cache"
import { curvatureBand, readAtlasArt } from "@/lib/gpx/atlas"
import { buildRouteStory } from "@/lib/gpx/route-story"
import { isAtlasPageOverBudget } from "@/lib/gpx/atlas-page-guard"
import { isGpxIntelligenceReport, type GpxIntelligenceReport } from "@/lib/gpx/intelligence"
import { GpxIntelligencePanel } from "@/components/planner/GpxIntelligencePanel"
import { RouteLibraryActions } from "@/components/route-library/RouteLibraryActions"
import { RouteDetailHeader } from "@/components/route-library/RouteDetailHeader"
import { RouteDetailMap } from "@/components/route-library/RouteDetailMap"
import { simplifyForOverlay } from "@/lib/routes/route-preview"
import { AppNavigationLinks } from "@/components/shell/AppNavigationLinks"
import { PRODUCT_BRAND } from "@/lib/brand/product-brand"
import {
  catalogDisplayTitle,
  classifyCatalogArea,
  knownDurationMinutes
} from "@/lib/gpx/catalog-presentation"
import { durationEvidence, surfaceEvidence, trackConfidence, twistinessEvidence } from "@/lib/routes/route-evidence"
import { routeHighlights, routeSizeEyebrow } from "@/lib/routes/route-highlights"
import type { Coordinate } from "@/lib/routing/types"

/**
 * The hero map is an overview; the planner opens the full line. Imported
 * tracks carry up to ~22,000 points, which all went into the page payload
 * (900 KB of HTML for the largest) for a map that cannot show them.
 */
const DETAIL_MAP_MAX_POINTS = 4_000

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
  bbox?: readonly [number, number, number, number]
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
    if (!manifestHasRoute(manifest, routeId)) return { route: null }
    const parsedRoute: unknown = await readJsonCached(path.join(root, "routes", `${routeId}.json`))
    if (!isDetailRoute(parsedRoute) || parsedRoute.id !== routeId) return { route: null }
    const art = (await readAtlasArt())[routeId]
    return { route: parsedRoute, ...art?.bbox ? { bbox: art.bbox } : {} }
  } catch {
    return { route: null }
  }
})

export async function generateMetadata({ params }: { params: Promise<{ routeId: string }> }): Promise<Metadata> {
  const { routeId } = await params
  const { route } = await loadRouteDetail(routeId)
  if (!route) return { title: `Route not found — ${PRODUCT_BRAND.name}` }
  const story = buildRouteStory({ ...route, durationMinutes: knownDurationMinutes(route.durationMinutes) })
  return {
    title: `${displayTitle(route, story.title)} — ${PRODUCT_BRAND.name} GPX Library`,
    description: story.summary
  }
}

/**
 * Rider-facing title. An imported filename is provenance, not a product name,
 * so the story title and the deterministic cleaner both get a turn before the
 * raw filename does — and the raw filename stays visible in the technical
 * details for anyone tracing the import.
 */
function displayTitle(route: AtlasDetailRoute, storyTitle: string): string {
  return catalogDisplayTitle({ catalogTitle: storyTitle, originalName: route.name })
}

const WHOLE_NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

function formatMiles(value: number): string {
  return WHOLE_NUMBER.format(Math.round(value))
}

function formatDuration(minutes: number | null): string | null {
  if (minutes === null) return null
  const total = Math.max(0, Math.round(minutes))
  if (total <= 0) return null
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

/** Plain-language climb character from total ascent over the ride's length. */
function climbCharacter(ascentMeters: number | null, distanceMiles: number): string | null {
  if (ascentMeters === null || ascentMeters <= 0 || distanceMiles <= 0) return null
  const feetPerMile = (ascentMeters * 3.28084) / distanceMiles
  if (feetPerMile < 30) return "Flat — barely any climbing"
  if (feetPerMile < 70) return "Rolling — gentle grades"
  if (feetPerMile < 130) return "Hilly — steady climbing throughout"
  return "Mountainous — sustained, serious climbs"
}

const BAND_CHARACTER: Record<ReturnType<typeof curvatureBand>, string> = {
  calm: "Calm",
  mellow: "Mellow",
  twisty: "Twisty",
  hairpin: "Hairpin"
}

const TECHNICAL_DETAILS_ID = "route-technical-details"

export default async function RouteDetailPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params
  if (routeId.length > 200 || !/^[A-Za-z0-9._-]+$/.test(routeId)) notFound()
  if (await isAtlasPageOverBudget()) {
    return (
      <main className="atlas-page">
        <p className="atlas-empty">
          <strong>Too many Route Library requests from this address.</strong>
          <span>Give it a minute and reload.</span>
        </p>
      </main>
    )
  }
  const { route, bbox } = await loadRouteDetail(routeId)
  if (!route) notFound()

  const geometry = Array.isArray(route.geometry) ? route.geometry : []
  const recordedMinutes = knownDurationMinutes(route.durationMinutes)
  const story = buildRouteStory({
    id: route.id,
    name: route.name,
    distanceMiles: route.distanceMiles,
    durationMinutes: recordedMinutes,
    twistiness: route.twistiness,
    turnCount: route.turnCount,
    ascentMeters: route.ascentMeters
  })
  const title = displayTitle(route, story.title)
  const area = classifyCatalogArea(bbox)
  const areaLabel = [area.region, ...area.ridingAreas].filter(Boolean).join(" · ")
  const band = curvatureBand(route.twistiness)

  const surface = surfaceEvidence({
    intelligence: route.gpxIntelligence ?? null,
    storedMix: route.surfaceMix ?? route.roadMix ?? null
  })
  const duration = durationEvidence({
    recordedMinutes,
    distanceMiles: route.distanceMiles,
    durationSource: route.gpxIntelligence?.durationSource ?? null
  })
  const corners = twistinessEvidence({ twistiness: route.twistiness, turnCount: route.turnCount })
  const confidence = trackConfidence(route.gpxIntelligence ?? null)
  const ascent = typeof route.ascentMeters === "number" && route.ascentMeters > 0 ? route.ascentMeters : null
  const descent = typeof route.descentMeters === "number" && route.descentMeters > 0 ? route.descentMeters : null
  const climb = climbCharacter(ascent, route.distanceMiles)
  const highlights = routeHighlights({
    distanceMiles: route.distanceMiles,
    twistiness: route.twistiness,
    turnCount: route.turnCount,
    ascentMeters: ascent,
    profile: route.profile ?? null,
    surface
  })
  const eyebrow = routeSizeEyebrow(route.distanceMiles)
  const turnsPerTenMiles = route.distanceMiles > 0 ? (route.turnCount / route.distanceMiles) * 10 : 0
  // Preview-only imports cannot be opened or saved as the real line.
  const canUseGeometry = geometry.length > 1 && route.previewOnly !== true

  return (
    <main className="atlas-page atlas-page--detail">
      <RouteDetailHeader routeName={title} detailsAnchor={TECHNICAL_DETAILS_ID} />

      <RouteDetailMap
        geometry={simplifyForOverlay(geometry, DETAIL_MAP_MAX_POINTS)}
        bbox={bbox ?? null}
        routeName={title}
        provenanceNote={route.previewOnly ? "Preview import — the full line was not stored." : null}
      />

      <section className="route-decision" aria-label="Route summary">
        {eyebrow ? <p className="route-decision__eyebrow">{eyebrow}</p> : null}
        <h2 className="route-decision__title">{title}</h2>
        {areaLabel ? <p className="route-decision__area">{areaLabel}</p> : null}

        <dl className="route-decision__stats">
          <div>
            <dt>Distance</dt>
            <dd>{formatMiles(route.distanceMiles)} mi</dd>
          </div>
          <div data-evidence={duration.level}>
            <dt>{duration.level === "verified" ? "Recorded time" : "Time"}</dt>
            <dd>
              {formatDuration(duration.minutes) ?? "Unknown"}
              {duration.level === "estimated" ? <span className="route-evidence-tag">Estimated</span> : null}
            </dd>
          </div>
          <div data-evidence={corners.level}>
            <dt>Corners</dt>
            <dd>
              {corners.level === "unknown" ? "Unknown" : BAND_CHARACTER[band]}
            </dd>
          </div>
          <div data-evidence={surface.level}>
            <dt>Surface</dt>
            <dd>
              {surface.unpavedShare === null ? (
                // The value *is* the evidence state here; repeating it as a
                // tag underneath says "Unknown / UNKNOWN".
                "Unknown"
              ) : (
                <>
                  {`${Math.round(surface.unpavedShare * 100)}% unpaved`}
                  <span className="route-evidence-tag">{surface.label}</span>
                </>
              )}
            </dd>
          </div>
        </dl>

        <RouteLibraryActions
          catalogRouteId={route.id}
          routeName={title}
          canUseGeometry={canUseGeometry}
          className="route-decision__actions"
        />

        <p className="route-decision__note">
          Open in Planner loads this shared line as a track without saving it. Save keeps your own copy on this
          device; the GPX Library entry stays as it is.
        </p>
      </section>

      {highlights.length > 0 ? (
        <section className="route-highlights" aria-label="Route highlights">
          <ul>
            {highlights.map((highlight) => (
              <li key={highlight.id} data-tone={highlight.tone} title={highlight.basis}>{highlight.label}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="route-section" aria-label="This ride">
        <h3>This ride</h3>
        <p className="route-section__lede">{story.summary}</p>
        <p>{story.body}</p>
      </section>

      <section className="route-section" aria-label="Elevation">
        <h3>Elevation</h3>
        {ascent ? (
          <>
            <p className="route-climb">
              <strong>↑ {formatMiles(ascent)} m</strong>
              {descent ? <span>↓ {formatMiles(descent)} m</span> : null}
            </p>
            {climb ? <p className="route-section__lede">{climb}.</p> : null}
          </>
        ) : (
          <p className="route-unavailable">Total climb was not recorded for this import.</p>
        )}
        {/* A per-mile elevation profile needs elevation samples along the line.
            This catalog stores totals only, so there is no chart to draw —
            and a flat or invented curve would read as a claim about the ride. */}
        <p className="route-unavailable">
          A per-mile elevation profile was not retained for this track.
        </p>
      </section>

      <section className="route-section" aria-label="Track confidence">
        <h3>Track confidence</h3>
        <p className="route-confidence" data-confidence={confidence.level}>
          <strong>{confidence.headline}.</strong> {confidence.detail}
        </p>
        <a className="route-section__more" href={`#${TECHNICAL_DETAILS_ID}`}>Learn more</a>
      </section>

      <section id={TECHNICAL_DETAILS_ID} className="route-section route-section--technical" aria-label="Route data and diagnostics">
        <h3>Route data &amp; diagnostics</h3>
        <dl className="route-technical">
          <div><dt>Mapped turns</dt><dd>{formatMiles(route.turnCount)}</dd></div>
          <div><dt>Turn density</dt><dd>{turnsPerTenMiles.toFixed(turnsPerTenMiles < 10 ? 1 : 0)} / 10 mi</dd></div>
          <div><dt>Curvature score</dt><dd>{Math.round(route.twistiness)}</dd></div>
          {route.profile ? <div><dt>Profile</dt><dd>{route.profile}</dd></div> : null}
          {area.region ? <div><dt>Region</dt><dd>{area.region}</dd></div> : null}
          {route.sourceProject ? <div><dt>Imported from</dt><dd>{route.sourceProject}</dd></div> : null}
          <div><dt>Original filename</dt><dd className="route-provenance">{route.name}</dd></div>
        </dl>

        {surface.distribution ? (
          <div className="route-mix" aria-label="Surface mix">
            <p className="route-mix__title">Surface mix <span className="route-evidence-tag">{surface.label}</span></p>
            <ul>
              {surface.distribution.map(([name, share]) => (
                <li key={name}><span>{name}</span><em>{Math.round(share)}%</em></li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="route-unavailable">Surface was never evaluated for this track, so no mix is shown.</p>
        )}

        {route.gpxIntelligence ? <GpxIntelligencePanel report={route.gpxIntelligence} /> : null}
      </section>

      <AppNavigationLinks active="explore" />
    </main>
  )
}
