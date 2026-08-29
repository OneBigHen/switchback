export interface RouteStoryInput {
  id: string
  name: string
  distanceMiles: number
  durationMinutes: number
  twistiness: number
  turnCount: number
  profile?: string | null
  ascentMeters?: number | null
}

export interface RouteStory {
  /** Short editorial headline, e.g. "A tight 107-mile ribbon through the hills". */
  title: string
  /** One-sentence character summary of the ride. */
  summary: string
  /** 2-3 sentences of rider-oriented description grounded in the route's stats. */
  body: string
  /** Stable short tag like "Epic haul", "Half-day loop", "Quick blast". */
  tone: string
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

function miles(distanceMiles: number): string {
  return NUMBER_FORMAT.format(Math.round(distanceMiles))
}

function hours(durationMinutes: number): string {
  const total = Math.max(0, Math.round(durationMinutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${NUMBER_FORMAT.format(m)} min`
}

function cleanName(name: string): string {
  return name
    .trim()
    .replace(/\.(gpx|kml|kmz)$/i, "")
    // Route-sharing sites append their own credit to the track name
    // ("… - created by someone on ADVHub.net"). It is the site's byline, not
    // part of the ride's name, and it crowds out the name itself in a card.
    .replace(/\s*[-–—]?\s*created by\b.*$/i, "")
    // Leading catalogue numbers ("000 Armstrong County Loops") are filing
    // artefacts from bulk exports.
    .replace(/^\d{2,}[\s._-]+(?=\D)/, "")
    .trim()
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** Distance band drives the pacing words everywhere else. */
function toneFor(distanceMiles: number): { tone: string; pace: string } {
  if (distanceMiles >= 400) return { tone: "Expedition", pace: "a multi-day expedition" }
  if (distanceMiles >= 200) return { tone: "Epic haul", pace: "an epic haul" }
  if (distanceMiles >= 90) return { tone: "Half-day run", pace: "a solid half-day run" }
  if (distanceMiles >= 35) return { tone: "Day loop", pace: "a proper day loop" }
  if (distanceMiles >= 12) return { tone: "Quick blast", pace: "a quick blast" }
  return { tone: "Short hop", pace: "a short hop" }
}

function twistWord(twistiness: number): string {
  if (twistiness >= 80) return "relentlessly twisty"
  if (twistiness >= 60) return "nicely twisty"
  if (twistiness >= 40) return "gently curving"
  if (twistiness >= 20) return "mostly straight"
  return "dead straight"
}

/**
 * Builds an editorial, human-readable story for a catalog route from its own
 * stats. Deterministic on purpose: same route, same words.
 */
export function buildRouteStory(route: RouteStoryInput): RouteStory {
  const { tone, pace } = toneFor(route.distanceMiles)
  const name = cleanName(route.name)
  // A large share of imported files are named by their export timestamp
  // ("2016-07-23 08:58:57") or a bare track number. Those are filenames, not
  // ride names, so they fall through to the generated title like any other
  // untitled import rather than being printed as a headline.
  const hasRealName = name.length > 0
    && !/^untitled$|^imported$|^new$/i.test(name)
    && !/^[\d\s:_/.-]+$/.test(name)
    && !/^(?:track|route|activity|segment)[\s_-]*\d*$/i.test(name)
  const twist = twistWord(route.twistiness)
  const turns = Math.max(0, Math.round(route.turnCount || 0))

  const title = hasRealName ? titleCase(name) : `The ${miles(route.distanceMiles)}-mile ${tone.toLowerCase()}`
  const summary = `${titleCase(pace)} that stays ${twist} start to finish.`

  const lines: string[] = []
  lines.push(
    `${NUMBER_FORMAT.format(Math.round(route.distanceMiles))} miles in about ${hours(route.durationMinutes)}${
      turns > 0 ? `, with roughly ${NUMBER_FORMAT.format(turns)} notable turns` : ""
    }.`
  )
  if (route.twistiness >= 60 && turns > 0) {
    lines.push(`Expect corner-after-corner riding — this one rewards a steady right hand and full attention.`)
  } else if (route.twistiness <= 20) {
    lines.push(`This is covering-ground country: long sightlines, relaxed pace, easy navigation.`)
  } else {
    lines.push(`A calm middle ground — flow enough to enjoy, straight enough to relax.`)
  }
  if (route.ascentMeters && route.ascentMeters > 250) {
    lines.push(`Climbs about ${NUMBER_FORMAT.format(Math.round(route.ascentMeters))} m over the course of the ride.`)
  }

  return { title, summary, body: lines.join(" "), tone }
}
