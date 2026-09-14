/**
 * What belongs in the shared Route Library, decided in one place.
 *
 * The project importer scans a whole workspace for GPX files, so the catalog
 * picked up other projects' test fixtures (gpx.studio `test-data`, Playwright
 * fixtures), planner "preview" exports whose line is a mile or two of a named
 * hundred-mile ride, and slivers split out of multi-track files. The importer,
 * the listing and `npm run gpx:curate` all apply these same rules, so a
 * re-import cannot bring back what curation removed.
 */

export type CatalogExclusionReason =
  | "fixture-source"
  | "preview-export"
  | "empty-track"
  | "split-fragment"
  | "placeholder-name"

export interface CatalogCurationInput {
  readonly id: string
  readonly name: string
  readonly distanceMiles: number
  readonly sourceFile?: string | null
  readonly sources?: readonly string[] | null
}

/** Split tracks shorter than this are connector slivers, not rides. */
export const MIN_SPLIT_TRACK_MILES = 10
/** A line shorter than this is a stray point cluster, not a route. */
export const MIN_TRACK_MILES = 1

const FIXTURE_PATH = /(?:^|[/\\])(?:node_modules|test-data|fixtures?|__tests__|__fixtures__|playwright|[^/\\]*\.(?:pending|previous)-[^/\\]*)(?:[/\\]|$)/i
/** "Scenic Route - 84mi", "preview 126 mi", "Leaser Lake 140 Miles": the length the name promises. */
const NAMED_LENGTH = /(?:^|[\s_(-])(\d+(?:\.\d+)?)\s*(?:mi|miles?)\b/i
const PLACEHOLDER_NAME = /^(?:test route|sample|example)$/i
const SPLIT_TRACK_ID = /--t\d+$/

export function isFixtureSourcePath(sourcePath: string): boolean {
  return FIXTURE_PATH.test(sourcePath)
}

/**
 * Why a route should stay out of the library, or null when it belongs.
 *
 * `familyDistanceMiles` is the combined length of every track split from the
 * same file; a name like "Twisty Loop - 126mi" describes the whole file, so a
 * part is judged against that total rather than against its own length.
 */
export function catalogExclusionReason(
  route: CatalogCurationInput,
  familyDistanceMiles = route.distanceMiles
): CatalogExclusionReason | null {
  const paths = [route.sourceFile ?? "", ...route.sources ?? []].filter(Boolean)
  if (paths.length > 0 && paths.every(isFixtureSourcePath)) return "fixture-source"

  if (route.distanceMiles < MIN_TRACK_MILES) return "empty-track"

  // Planner exports are named for the ride they previewed, but some carry only
  // the first mile or two of its line ("Scenic Route - 84mi" drawing 1 mile).
  const named = route.name.match(NAMED_LENGTH)
  if (named && Math.max(route.distanceMiles, familyDistanceMiles) < Number(named[1]) * 0.5) return "preview-export"

  if (PLACEHOLDER_NAME.test(route.name.trim())) return "placeholder-name"

  if (SPLIT_TRACK_ID.test(route.id) && route.distanceMiles < MIN_SPLIT_TRACK_MILES) return "split-fragment"
  return null
}

export const CATALOG_EXCLUSION_LABEL: Readonly<Record<CatalogExclusionReason, string>> = {
  "fixture-source": "Test fixture from another project",
  "preview-export": "Export far shorter than the ride its name describes",
  "empty-track": `Track under ${MIN_TRACK_MILES} mile`,
  "split-fragment": `Split-track piece under ${MIN_SPLIT_TRACK_MILES} miles`,
  "placeholder-name": "Placeholder test route"
}

/** The file id a split track came from (`project-gpx-…--t2` → `project-gpx-…`). */
export function splitTrackParent(routeId: string): string | null {
  return SPLIT_TRACK_ID.test(routeId) ? routeId.replace(SPLIT_TRACK_ID, "") : null
}

/** Combined miles of every track split from the same file, keyed by route id. */
export function splitFamilyDistances(routes: readonly CatalogCurationInput[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const route of routes) {
    const parent = splitTrackParent(route.id)
    if (parent) totals.set(parent, (totals.get(parent) ?? 0) + route.distanceMiles)
  }
  const byRoute = new Map<string, number>()
  for (const route of routes) {
    const parent = splitTrackParent(route.id)
    byRoute.set(route.id, parent ? totals.get(parent) ?? route.distanceMiles : route.distanceMiles)
  }
  return byRoute
}

/** Every route with the reason it is excluded; routes that belong are omitted. */
export function catalogExclusions<T extends CatalogCurationInput>(
  routes: readonly T[]
): Array<{ route: T; reason: CatalogExclusionReason }> {
  const family = splitFamilyDistances(routes)
  return routes.flatMap((route) => {
    const reason = catalogExclusionReason(route, family.get(route.id))
    return reason ? [{ route, reason }] : []
  })
}

const MACHINE_FILENAME = /gaia_high_detail|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|(?:^|[-_ ])[0-9a-f]{8}(?:[-_ ]|$)/i
const GENERIC_WORDS = /^(?:new|track|route|untitled|imported|activity|segment|ride|original|all)$/i

/**
 * A readable name recovered from the source files when the GPX itself only
 * said "new", "Track" or a timestamp. Machine-written export names (hash
 * suffixes, `gaia_high_detail`) are skipped rather than turned into titles.
 */
export function humanSourceName(sources: readonly string[]): string | null {
  for (const source of sources) {
    const base = source.split(/[/\\]/).pop()?.replace(/\.(?:gpx|kml|kmz)$/i, "").trim() ?? ""
    if (!base || MACHINE_FILENAME.test(base)) continue
    const words = base.split(/[\s_-]+/).filter(Boolean)
    const meaningful = words.filter((word) => /[a-z]{2,}/i.test(word) && !GENERIC_WORDS.test(word))
    if (meaningful.length === 0) continue
    return words.join(" ").replace(/\s+/g, " ").trim()
  }
  return null
}

/** "2016-07-23 08:58:57" → "Jul 23, 2016"; null for names that are not a timestamp. */
export function timestampNameDate(name: string): string | null {
  const match = name.trim().match(/^(\d{4})[-_ /.](\d{2})[-_ /.](\d{2})(?:[ T_]\d{2}[:_-]\d{2}(?:[:_-]\d{2})?)?$/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== Number(match[2]) - 1) return null
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}
