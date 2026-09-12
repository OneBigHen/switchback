import { cleanCatalogRouteName, knownDurationMinutes } from "@/lib/gpx/catalog-presentation"

export interface RouteStoryInput {
  id: string
  name: string
  distanceMiles: number
  /** Imported moving time; `null`, zero, negative or non-finite means unknown. */
  durationMinutes: number | null
  twistiness: number
  turnCount: number
  profile?: string | null
  ascentMeters?: number | null
}

export interface RouteStory {
  /** Short rider-facing headline, normally the cleaned import name. */
  title: string
  /** One sentence describing only route-level facts OpenGravel actually knows. */
  summary: string
  /** Compact description grounded in imported distance/time/turn/elevation metrics. */
  body: string
  /** Stable distance band used as a compact browsing tag. */
  tone: string
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

function miles(distanceMiles: number): string {
  return NUMBER_FORMAT.format(Math.max(0, Math.round(distanceMiles)))
}

function hours(durationMinutes: number): string {
  const total = Math.max(0, Math.round(durationMinutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${NUMBER_FORMAT.format(m)} min`
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Distance alone cannot tell us whether a route is a loop, a half-day ride, or
 * a multi-day trip. These labels deliberately describe size only.
 */
function toneFor(distanceMiles: number): { tone: string; phrase: string } {
  if (distanceMiles >= 400) return { tone: "Expedition distance", phrase: "an expedition-distance route" }
  if (distanceMiles >= 200) return { tone: "Long distance", phrase: "a long-distance route" }
  if (distanceMiles >= 90) return { tone: "Big ride", phrase: "a substantial route" }
  if (distanceMiles >= 35) return { tone: "Mid-distance", phrase: "a mid-distance route" }
  if (distanceMiles >= 12) return { tone: "Short ride", phrase: "a compact route" }
  return { tone: "Short hop", phrase: "a short route" }
}

/** Route-level curvature band. This does not claim every road has that shape. */
function twistWord(twistiness: number): string {
  if (twistiness >= 72) return "very twisty"
  if (twistiness >= 52) return "twisty"
  if (twistiness >= 32) return "flowing"
  if (twistiness >= 16) return "mostly open"
  return "low-curvature"
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

/**
 * Builds a deterministic route summary from metrics stored on the import.
 * Deliberately absent: inferred surface, legality, safety, sightlines, pace,
 * loop shape, road uniformity, or riding-time claims the source data does not
 * establish. Same route, same words.
 */
export function buildRouteStory(route: RouteStoryInput): RouteStory {
  const distanceMiles = finiteNonNegative(route.distanceMiles)
  const durationMinutes = knownDurationMinutes(route.durationMinutes)
  const turnCount = Math.round(finiteNonNegative(route.turnCount))
  const twistiness = Math.min(100, Math.round(finiteNonNegative(route.twistiness)))
  const { tone, phrase } = toneFor(distanceMiles)
  const name = cleanCatalogRouteName(route.name)

  // A large share of imported files are named by their export timestamp
  // ("2016-07-23 08:58:57") or a bare track number. Those are filenames, not
  // ride names, so they fall through to a generated factual title.
  const hasRealName = name.length > 0
    && !/^(?:untitled|imported|new|imported gpx|unnamed)$/i.test(name)
    && !/^[\d\s:_/.-]+$/.test(name)
    && !/^(?:track|route|activity|segment)[\s_-]*\d*$/i.test(name)

  const title = hasRealName ? titleCase(name) : `${miles(distanceMiles)}-mile imported route`
  const character = twistWord(twistiness)
  const summary = `${sentenceCase(phrase)} with a ${character} overall curvature profile.`

  const stats: string[] = [`${miles(distanceMiles)} miles`]
  // Many imports carry no timing at all; claim a duration only when there is one.
  if (durationMinutes !== null) stats.push(`about ${hours(durationMinutes)}`)
  if (turnCount > 0) stats.push(`${NUMBER_FORMAT.format(turnCount)} mapped turns`)
  if (typeof route.ascentMeters === "number" && Number.isFinite(route.ascentMeters) && route.ascentMeters > 0) {
    stats.push(`about ${NUMBER_FORMAT.format(Math.round(route.ascentMeters))} m of climbing`)
  }

  const body = `${stats.join(", ")}. Route-level twistiness: ${twistiness}/100 (${character} overall).`
  return { title, summary, body, tone }
}
