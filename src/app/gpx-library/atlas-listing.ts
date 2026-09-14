import { curvatureBand, type AtlasRouteArt, type CurvatureBand } from "@/lib/gpx/atlas"
import { catalogExclusions, humanSourceName, splitTrackParent, timestampNameDate } from "@/lib/gpx/catalog-curation"
import {
  catalogDisplayTitle,
  classifyCatalogArea,
  cleanCatalogRouteName,
  cleanImportedRouteTitle,
  knownDurationMinutes
} from "@/lib/gpx/catalog-presentation"
import { buildRouteStory } from "@/lib/gpx/route-story"
import type { AtlasBrowseRoute } from "./atlas-browse"

/** One validated manifest row as the Route Library page reads it from disk. */
export interface AtlasListingRoute {
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  sourceProject: string
  /** Source path the route was imported from, relative to the scanned root. */
  sourceFile?: string
  /** Every source path with identical content. */
  sources?: string[]
  profile?: string
  duplicateFamilyId?: string
  duplicateFamilyRole?: "canonical" | "near-duplicate"
  /** Set by imports that kept only a preview line, not the real route. */
  previewOnly?: boolean
}

/**
 * The card title.
 *
 * A real ride name goes through the usual display precedence. An import named
 * only "Imported GPX", "new", "Track" or its export timestamp used to fall back
 * to that very name (21 cards read "Imported GPX · N mi"); it now takes a
 * readable source filename when one exists ("Downingtown jaunt"), keeps a
 * timestamp as a date, and otherwise says what it is and where: "88-mile ride
 * near PA Wilds".
 */
function listingTitle(
  route: AtlasListingRoute,
  story: ReturnType<typeof buildRouteStory>,
  area: { region: string | null; ridingAreas: readonly string[] }
): string {
  if (!story.generatedTitle) {
    // A catalog title that still reads as the file it came from is not a
    // title; the imported filename stays intact on `name` as provenance.
    return catalogDisplayTitle({ catalogTitle: story.title, originalName: route.name })
  }
  const date = timestampNameDate(route.name)
  const fromSource = humanSourceName([route.sourceFile ?? "", ...route.sources ?? []].filter(Boolean))
  if (fromSource) {
    const cleaned = cleanImportedRouteTitle(fromSource) || fromSource
    return date ? `${cleaned} · ${date}` : cleaned
  }
  if (date) return `Ride on ${date}`
  const ride = `${Math.round(route.distanceMiles)}-mile ride`
  if (area.ridingAreas[0]) return `${ride} near ${area.ridingAreas[0]}`
  return area.region ? `${ride} in ${area.region}` : ride
}

/** Fold one manifest row + its poster art into the shape the browser UI wants. */
function toBrowseRoute(route: AtlasListingRoute, art: AtlasRouteArt | undefined): AtlasBrowseRoute {
  const durationMinutes = knownDurationMinutes(route.durationMinutes)
  const story = buildRouteStory({ ...route, durationMinutes })
  const bbox = art?.bbox ?? null
  const area = classifyCatalogArea(bbox)
  return {
    id: route.id,
    name: cleanCatalogRouteName(route.name) || route.name.trim(),
    title: listingTitle(route, story, area),
    tone: story.tone,
    band: curvatureBand(route.twistiness),
    distanceMiles: route.distanceMiles,
    durationMinutes,
    turnCount: route.turnCount,
    twistiness: route.twistiness,
    // The public listing carries no surface mix; the field stays wired for when
    // the importer starts persisting it.
    unpavedShare: null,
    profile: route.profile ?? null,
    bbox,
    region: area.region,
    ridingAreas: area.ridingAreas,
    aspect: typeof art?.aspect === "number" && art.aspect > 0 ? art.aspect : 1,
    paths: art ? art.paths.map((piece) => piece.d) : [],
    start: art?.start ?? null,
    end: art?.end ?? null,
    // Poster art proves a drawable shape, not a retained real route.
    canUseGeometry: route.previewOnly !== true
  }
}

/**
 * Browse rows for the Route Library: one card per ride, not per import, built
 * only from summary rows and precomputed poster art — never per-route geometry.
 *
 * Two passes fold repeats: the atlas builder marks geometry-identical
 * re-imports with `duplicateOf`, and the importer groups near-identical tracks
 * into `duplicateFamilyId` families — keep that family's canonical (or its
 * longest track when none is flagged).
 */
export function buildAtlasBrowseRoutes(
  routes: readonly AtlasListingRoute[],
  art: Readonly<Record<string, AtlasRouteArt>>
): AtlasBrowseRoute[] {
  // Curation rules the importer and `npm run gpx:curate` share: fixtures,
  // stub exports and split-track slivers never reach a card, even before the
  // data itself has been curated.
  const excluded = new Set(catalogExclusions(routes).map(({ route }) => route.id))
  const drawable = routes.filter((route) => art[route.id] && !art[route.id]?.duplicateOf && !excluded.has(route.id))
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
  const kept = drawable
    .filter((route) => !route.duplicateFamilyId || familyPick.get(route.duplicateFamilyId)?.id === route.id)
  const bands = catalogCurvatureBands(kept)
  const browseRoutes = withSplitTrackParts(kept, kept.map((route) => ({
    ...toBrowseRoute(route, art[route.id]),
    band: bands.get(route.id) ?? curvatureBand(route.twistiness)
  })))

  // Bulk imports name several genuinely different rides identically ("… Loops",
  // "Huntington Motor Inn Connector"). When a title repeats, tag each with its
  // distance so the cards stay tellable apart: whole miles first, a decimal
  // where whole miles still collide, then an ordinal for identical distances.
  const repeated = (titles: readonly string[]) => {
    const tally = new Map<string, number>()
    for (const title of titles) tally.set(title, (tally.get(title) ?? 0) + 1)
    return (title: string) => (tally.get(title) ?? 0) > 1
  }
  const baseRepeats = repeated(browseRoutes.map((route) => route.title))
  const wholeMiles = browseRoutes.map((route) =>
    baseRepeats(route.title) ? `${route.title} · ${Math.round(route.distanceMiles)} mi` : route.title
  )
  const wholeRepeats = repeated(wholeMiles)
  const tenths = browseRoutes.map((route, index) =>
    wholeRepeats(wholeMiles[index]!) ? `${route.title} · ${route.distanceMiles.toFixed(1)} mi` : wholeMiles[index]!
  )
  const tenthsRepeats = repeated(tenths)
  const seen = new Map<string, number>()
  return browseRoutes.map((route, index) => {
    const title = tenths[index]!
    if (!tenthsRepeats(title)) return title === route.title ? route : { ...route, title }
    const ordinal = (seen.get(title) ?? 0) + 1
    seen.set(title, ordinal)
    return { ...route, title: ordinal === 1 ? title : `${title} (${ordinal})` }
  })
}

/**
 * Several rides split out of one multi-track file share its name. Numbering
 * them as parts of that file says how they relate, which a bare mileage
 * suffix ("Armstrong County Loops · 67 mi") never did.
 */
function withSplitTrackParts(routes: readonly AtlasListingRoute[], rows: AtlasBrowseRoute[]): AtlasBrowseRoute[] {
  const siblings = new Map<string, AtlasListingRoute[]>()
  for (const route of routes) {
    const parent = splitTrackParent(route.id)
    if (parent) siblings.set(parent, [...siblings.get(parent) ?? [], route])
  }
  const trackNumber = (id: string) => Number(id.match(/--t(\d+)$/)?.[1] ?? 0)
  return rows.map((row, index) => {
    const parent = splitTrackParent(routes[index]!.id)
    const family = parent ? siblings.get(parent) ?? [] : []
    if (family.length < 2) return row
    const ordered = [...family].sort((left, right) => trackNumber(left.id) - trackNumber(right.id))
    const part = ordered.findIndex((route) => route.id === row.id) + 1
    return { ...row, title: `${row.title} · part ${part} of ${ordered.length}` }
  })
}

const CATALOG_BANDS: readonly CurvatureBand[] = ["calm", "mellow", "twisty", "hairpin"]
/** Below this many routes a library-relative ranking says nothing; use the absolute band. */
const MIN_ROUTES_FOR_RELATIVE_BANDS = 8

/**
 * Curvature bands relative to this library, from turns per mile.
 *
 * The stored twistiness score saturates on dense GPS tracks — 134 of 157 cards
 * scored 100 and read "Hairpin", so the band and the Twisty filter told routes
 * apart not at all. Turn density still spreads (quartiles near 4, 6 and 9
 * turns a mile), so each route is filed by its quartile within the catalog.
 */
export function catalogCurvatureBands(
  routes: ReadonlyArray<Pick<AtlasListingRoute, "id" | "distanceMiles" | "turnCount">>
): Map<string, CurvatureBand> {
  const measured = routes
    .filter((route) => route.distanceMiles > 0 && Number.isFinite(route.turnCount))
    .map((route) => ({ id: route.id, density: route.turnCount / route.distanceMiles }))
  const bands = new Map<string, CurvatureBand>()
  if (measured.length < MIN_ROUTES_FOR_RELATIVE_BANDS) return bands
  const sorted = [...measured].sort((left, right) => left.density - right.density)
  sorted.forEach((route, index) => {
    bands.set(route.id, CATALOG_BANDS[Math.min(3, Math.floor((index / sorted.length) * 4))]!)
  })
  return bands
}
