import { curvatureBand, type AtlasRouteArt } from "@/lib/gpx/atlas"
import { classifyCatalogArea, cleanCatalogRouteName, knownDurationMinutes } from "@/lib/gpx/catalog-presentation"
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
  profile?: string
  duplicateFamilyId?: string
  duplicateFamilyRole?: "canonical" | "near-duplicate"
  /** Set by imports that kept only a preview line, not the real route. */
  previewOnly?: boolean
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
    title: story.title,
    tone: story.tone,
    band: curvatureBand(route.twistiness),
    distanceMiles: route.distanceMiles,
    durationMinutes,
    turnCount: route.turnCount,
    twistiness: route.twistiness,
    // The public listing carries no surface mix; the field stays wired for when
    // the importer starts persisting it.
    unpavedShare: null,
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
