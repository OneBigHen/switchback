import type { Metadata } from "next"
import Link from "next/link"
import path from "node:path"
import { readDerivedCached } from "@/lib/gpx/catalog-cache"
import { atlasPathColor, readAtlasArt, curvatureBand } from "@/lib/gpx/atlas"
import { summariseAtlas, type AtlasStandout, type AtlasSummary } from "@/lib/gpx/atlas-summary"
import { buildRouteStory } from "@/lib/gpx/route-story"
import { isAtlasPageOverBudget } from "@/lib/gpx/atlas-page-guard"
import type { AtlasRouteArt } from "@/lib/gpx/atlas"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Route atlas",
  description: "Every ride imported into Switchback, redrawn from its own GPS geometry — with the collection summarised by distance, corner mix and provenance."
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

// Constructing an Intl formatter is the expensive part; these are shared by
// every card on the poster wall, so build each once.
const WHOLE_NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

function formatMiles(value: number): string {
  return WHOLE_NUMBER.format(Math.round(value))
}

function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

const GROUPED_NUMBER = new Intl.NumberFormat("en-US")

function formatCount(value: number): string {
  return GROUPED_NUMBER.format(Math.round(value))
}

/** The poster geometry at thumbnail size, for the standout cards. */
function PosterMark({ art, label }: { art: AtlasRouteArt | undefined; label: string }) {
  if (!art) return <span className="atlas-standout-mark is-empty" aria-hidden="true" />
  return (
    <svg className="atlas-standout-mark" viewBox="0 0 100 125" role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {art.paths.map((piece, index) => (
        <path key={index} d={piece.d} style={{ color: atlasPathColor(piece) }} />
      ))}
    </svg>
  )
}

function StandoutCard({ art, standout, kicker, value, unit }: {
  art: Record<string, AtlasRouteArt>
  standout: AtlasStandout | null
  kicker: string
  value: string
  unit: string
}) {
  if (!standout) return null
  // Same title the poster wall shows, so an award and its card read as one ride.
  const title = buildRouteStory(standout).title
  return (
    <Link href={`/gpx-library/${standout.id}`} className="atlas-standout">
      <PosterMark art={art[standout.id]} label={`Poster map of ${title}`} />
      <span className="atlas-standout-body">
        <span className="atlas-standout-kicker">{kicker}</span>
        <strong className="atlas-standout-value">{value}<em>{unit}</em></strong>
        <span className="atlas-standout-name">{title}</span>
      </span>
    </Link>
  )
}

function AtlasSummaryPanel({ summary, art }: { summary: AtlasSummary; art: Record<string, AtlasRouteArt> }) {
  const rideable = summary.bands.reduce((total, slice) => total + slice.count, 0)
  const busiestBin = Math.max(1, ...summary.lengths.map((bin) => bin.count))
  const flagged = summary.oversized + summary.empty

  return (
    <section className="atlas-summary" aria-label="Collection summary">
      <dl className="atlas-kpis">
        <div className="atlas-kpi">
          <dt>Route posters</dt>
          <dd>{formatCount(summary.posters)}</dd>
          <p>folded from {formatCount(summary.importedVariants)} imported routes</p>
        </div>
        <div className="atlas-kpi">
          <dt>Miles catalogued</dt>
          <dd>{formatCount(summary.totalMiles)}</dd>
          <p>{formatCount(summary.medianMiles)} mi median ride</p>
        </div>
        <div className="atlas-kpi">
          <dt>Hours of riding</dt>
          <dd>{formatCount(summary.totalHours)}</dd>
          <p>moving time across the collection</p>
        </div>
        <div className="atlas-kpi">
          <dt>Corners</dt>
          <dd>{formatCount(summary.totalTurns)}</dd>
          <p>turns counted from geometry</p>
        </div>
      </dl>

      <div className="atlas-figures">
        <figure className="atlas-figure">
          <figcaption>
            <strong>Corner mix</strong>
            <span>Share of {formatCount(rideable)} rideable routes by curvature band</span>
          </figcaption>
          <div className="atlas-mixbar" role="img" aria-label={summary.bands.map((slice) => `${slice.band} ${Math.round(slice.share * 100)}%`).join(", ")}>
            {summary.bands.flatMap((slice) => slice.count === 0 ? [] : [(
              <span
                key={slice.band}
                className="atlas-mixbar-segment"
                style={{ width: `${slice.share * 100}%`, background: atlasPathColor({ band: slice.band }) }}
              />
            )])}
          </div>
          <ul className="atlas-mix-legend">
            {summary.bands.map((slice) => (
              <li key={slice.band}>
                <i aria-hidden="true" style={{ background: atlasPathColor({ band: slice.band }) }} />
                <strong>{slice.band}</strong>
                <em>{formatCount(slice.count)}</em>
                <span>{Math.round(slice.share * 100)}%</span>
              </li>
            ))}
          </ul>
        </figure>

        <figure className="atlas-figure">
          <figcaption>
            <strong>Route lengths</strong>
            <span>How far a single ride in the atlas actually goes</span>
          </figcaption>
          <ul className="atlas-hist">
            {summary.lengths.map((bin) => (
              <li key={bin.label}>
                <span className="atlas-hist-label">{bin.label}</span>
                <span className="atlas-hist-track">
                  <span className="atlas-hist-bar" style={{ width: `${bin.count / busiestBin * 100}%` }} />
                </span>
                <em>{formatCount(bin.count)}</em>
              </li>
            ))}
          </ul>
        </figure>
      </div>

      <div className="atlas-standouts">
        <StandoutCard art={art} standout={summary.longest} kicker="Longest ride" value={formatCount(summary.longest?.distanceMiles ?? 0)} unit="mi" />
        <StandoutCard art={art} standout={summary.mostTurns} kicker="Most corners" value={formatCount(summary.mostTurns?.turnCount ?? 0)} unit="turns" />
        <StandoutCard art={art} standout={summary.twistiest} kicker="Twistiest" value={formatCount(summary.twistiest?.twistiness ?? 0)} unit="/100" />
      </div>

      <div className="atlas-provenance">
        <h2>Where these came from</h2>
        <ul className="atlas-sources">
          {summary.sources.map((source) => (
            <li key={source.project}>
              <span className="atlas-source-name">{source.project}</span>
              <span className="atlas-hist-track">
                <span className="atlas-hist-bar" style={{ width: `${source.share * 100}%` }} />
              </span>
              <em>{formatCount(source.count)}</em>
            </li>
          ))}
        </ul>
        {flagged > 0 ? (
          <p className="atlas-flagged">
            {flagged === 1 ? "One route sits" : `${formatCount(flagged)} routes sit`} outside the totals above:{" "}
            {[
              summary.oversized > 0 ? `${formatCount(summary.oversized)} still ${summary.oversized === 1 ? "looks" : "look"} like a whole ride collection saved as one track` : null,
              summary.empty > 0 ? `${formatCount(summary.empty)} ${summary.empty === 1 ? "carries" : "carry"} no rideable distance` : null
            ].filter(Boolean).join(", and ")}. Their posters are still below.
          </p>
        ) : null}
      </div>
    </section>
  )
}

function formatUpdated(value: string | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : `Library updated ${date.toLocaleDateString("en-US", { dateStyle: "long" })}`
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
  const updatedLabel = formatUpdated(generatedAt)

  // Poster wall: one poster per ride, decided by the poster art alone.
  //
  // Two independent passes fold duplicates — the importer's fingerprint families
  // in the manifest, and the atlas builder's geometry match — and they elect
  // different canonicals for around a hundred families each. Requiring a route
  // to be canonical in both discarded every route the two disagreed about, which
  // was most of the wall. The art is authoritative here because it is what draws
  // a poster: a route folded by the builder carries no paths of its own.
  const hiddenDuplicates = routes.filter((route) => art[route.id]?.duplicateOf).length
  const ordered = routes
    .filter((route) => !art[route.id]?.duplicateOf)
    .sort((a, b) => b.distanceMiles - a.distanceMiles)
  const summary = summariseAtlas(ordered, {
    importedVariants: routes.length,
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
        {/* The counts moved into the summary tiles below; the lede says what
            the page is rather than repeating them. */}
        <p className="atlas-lede">
          Every ride ever imported into Switchback, redrawn from its own GPS geometry — colour follows the
          corners, so a poster shows you how a road actually rides before you read a single number.
        </p>
        {updatedLabel ? <p className="atlas-updated">{updatedLabel}</p> : null}
        <p className="atlas-legend" aria-label="Curvature color legend">
          <span className="atlas-legend-ramp" aria-hidden="true" />
          calm → hairpin
        </p>
      </header>

      {ordered.length > 0 ? <AtlasSummaryPanel summary={summary} art={art} /> : null}

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
