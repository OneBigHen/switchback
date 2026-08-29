import { curvatureBand, type CurvatureBand } from "./atlas"

/**
 * Aggregates for the route atlas collection view.
 *
 * The atlas is an import of other people's GPX files, so the collection is not
 * clean: a handful of files are whole ride *collections* saved as one track
 * (thousands of miles, thousands of turns) and a handful are empty stubs. Those
 * distort a naive total badly — one 10,663-mile file is by itself a third of the
 * catalogue's mileage — so the summary reports headline totals over the routes
 * that plausibly describe a single ride and discloses the rest rather than
 * silently dropping or silently including them.
 */

/** A single GPX file that survived poster de-duplication. */
export interface AtlasSummaryRoute {
  readonly id: string
  readonly name: string
  readonly distanceMiles: number
  readonly durationMinutes: number
  readonly twistiness: number
  readonly turnCount: number
  readonly sourceProject: string
}

/** Above this, a single GPX track is a merged collection, not one ride. */
export const IMPLAUSIBLE_ROUTE_MILES = 600
/** Below this, the file carries no rideable geometry. */
export const EMPTY_ROUTE_MILES = 1

export interface AtlasBandSlice {
  readonly band: CurvatureBand
  readonly count: number
  /** 0–1 share of the plausible collection. */
  readonly share: number
}

export interface AtlasLengthBin {
  readonly label: string
  readonly count: number
}

export interface AtlasSourceSlice {
  readonly project: string
  readonly count: number
  readonly share: number
}

export interface AtlasStandout {
  readonly id: string
  readonly name: string
  readonly distanceMiles: number
  readonly durationMinutes: number
  readonly turnCount: number
  readonly twistiness: number
}

export interface AtlasSummary {
  readonly posters: number
  readonly importedVariants: number
  readonly foldedVariants: number
  /** Routes excluded from headline totals, with the reason split out. */
  readonly oversized: number
  readonly empty: number
  readonly totalMiles: number
  readonly totalHours: number
  readonly totalTurns: number
  readonly medianMiles: number
  readonly bands: readonly AtlasBandSlice[]
  readonly lengths: readonly AtlasLengthBin[]
  readonly sources: readonly AtlasSourceSlice[]
  readonly longest: AtlasStandout | null
  readonly mostTurns: AtlasStandout | null
  readonly twistiest: AtlasStandout | null
}

const BAND_ORDER: readonly CurvatureBand[] = ["calm", "mellow", "twisty", "hairpin"]

const LENGTH_BINS: readonly { label: string; from: number; to: number }[] = [
  { label: "Under 25 mi", from: 0, to: 25 },
  { label: "25–50", from: 25, to: 50 },
  { label: "50–100", from: 50, to: 100 },
  { label: "100–200", from: 100, to: 200 },
  { label: "200–400", from: 200, to: 400 },
  { label: "400 mi+", from: 400, to: Number.POSITIVE_INFINITY }
]

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0
}

function standout(
  routes: readonly AtlasSummaryRoute[],
  rank: (route: AtlasSummaryRoute) => number,
  taken: ReadonlySet<string>
): AtlasStandout | null {
  // One route often tops several rankings at once — the longest ride tends to
  // also carry the most corners — and three cards naming the same ride tells
  // the reader nothing. Each award goes to the best route not already holding
  // one, so the row surfaces three different rides.
  let best: AtlasSummaryRoute | null = null
  for (const route of routes) {
    if (taken.has(route.id)) continue
    if (best === null || rank(route) > rank(best)) best = route
  }
  return best === null ? null : {
    id: best.id,
    name: best.name,
    distanceMiles: best.distanceMiles,
    durationMinutes: best.durationMinutes,
    turnCount: best.turnCount,
    twistiness: best.twistiness
  }
}

export function summariseAtlas(
  routes: readonly AtlasSummaryRoute[],
  { importedVariants, foldedVariants }: { importedVariants: number; foldedVariants: number }
): AtlasSummary {
  const oversized = routes.filter((route) => route.distanceMiles > IMPLAUSIBLE_ROUTE_MILES)
  const empty = routes.filter((route) => route.distanceMiles < EMPTY_ROUTE_MILES)
  const rideable = routes.filter(
    (route) => route.distanceMiles >= EMPTY_ROUTE_MILES && route.distanceMiles <= IMPLAUSIBLE_ROUTE_MILES
  )

  const counts = new Map<CurvatureBand, number>(BAND_ORDER.map((band) => [band, 0]))
  for (const route of rideable) {
    const band = curvatureBand(route.twistiness)
    counts.set(band, (counts.get(band) ?? 0) + 1)
  }

  const projects = new Map<string, number>()
  for (const route of rideable) {
    projects.set(route.sourceProject, (projects.get(route.sourceProject) ?? 0) + 1)
  }

  const denominator = rideable.length === 0 ? 1 : rideable.length

  const claimed = new Set<string>()
  const longest = standout(rideable, (route) => route.distanceMiles, claimed)
  if (longest) claimed.add(longest.id)
  const mostTurns = standout(rideable, (route) => route.turnCount, claimed)
  if (mostTurns) claimed.add(mostTurns.id)
  const twistiest = standout(rideable, (route) => route.twistiness, claimed)

  return {
    posters: routes.length,
    importedVariants,
    foldedVariants,
    oversized: oversized.length,
    empty: empty.length,
    totalMiles: rideable.reduce((total, route) => total + route.distanceMiles, 0),
    totalHours: rideable.reduce((total, route) => total + route.durationMinutes, 0) / 60,
    totalTurns: rideable.reduce((total, route) => total + route.turnCount, 0),
    medianMiles: median(rideable.map((route) => route.distanceMiles)),
    bands: BAND_ORDER.map((band) => ({
      band,
      count: counts.get(band) ?? 0,
      share: (counts.get(band) ?? 0) / denominator
    })),
    lengths: LENGTH_BINS.map(({ label, from, to }) => ({
      label,
      count: rideable.filter((route) => route.distanceMiles >= from && route.distanceMiles < to).length
    })),
    sources: [...projects.entries()]
      .map(([project, count]) => ({ project, count, share: count / denominator }))
      .sort((a, b) => b.count - a.count),
    longest,
    mostTurns,
    twistiest
  }
}
