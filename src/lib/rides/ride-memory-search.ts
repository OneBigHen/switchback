import type { RideFingerprint, RideMemorySource } from "@/lib/rides/ride-memory"

export type RideMemoryRegion = "ne" | "nw" | "se" | "sw" | "cross" | "outside"
export type RideMemorySort = "stable" | "twistiness-desc" | "gravel-desc"

export interface RideMemorySearchDocument {
  id: string
  source: RideMemorySource
  name: string
  sourceLabel: string
  distanceMiles: number
  durationMinutes: number | null
  tags: string[]
  roadNames?: string[]
  region?: RideMemoryRegion
  fingerprint?: RideFingerprint
}

export interface ParsedRideMemoryQuery {
  source?: RideMemorySource
  region?: RideMemoryRegion
  minMiles?: number
  maxMiles?: number
  minMinutes?: number
  maxMinutes?: number
  minTwistiness?: number
  minGravelShare?: number
  maxGravelShare?: number
  maxHighwayShare?: number
  requireTwistiness: boolean
  requireGravel: boolean
  sort: RideMemorySort
  terms: string[]
  impossible: boolean
}

const STOP_WORDS = new Set([
  "a", "all", "and", "around", "find", "for", "from", "in", "me", "mile", "miles", "mi",
  "minute", "minutes", "min", "hour", "hours", "hr", "hrs", "my", "of", "on", "pa", "pennsylvania",
  "please", "ride", "rides", "route", "routes", "show", "some", "that", "the", "through", "with"
])

const SOURCE_PATTERNS: ReadonlyArray<{ source: RideMemorySource; pattern: RegExp }> = [
  { source: "recorded-ride", pattern: /\b(?:recorded|recording|ridden)\b/i },
  { source: "saved-route", pattern: /\b(?:saved|planned)\b/i },
  { source: "trip-plan", pattern: /\b(?:trip|trips)\b/i },
  { source: "project-gpx", pattern: /\b(?:imported|gpx)\b/i }
]

const REGION_PATTERNS: ReadonlyArray<{ region: RideMemoryRegion; pattern: RegExp }> = [
  { region: "cross", pattern: /\b(?:cross[ -]?region|crossing regions)\b/i },
  { region: "outside", pattern: /\b(?:outside pa|outside pennsylvania)\b/i },
  { region: "ne", pattern: /\b(?:ne|northeast|north east)\b/i },
  { region: "nw", pattern: /\b(?:nw|northwest|north west)\b/i },
  { region: "se", pattern: /\b(?:se|southeast|south east)\b/i },
  { region: "sw", pattern: /\b(?:sw|southwest|south west)\b/i }
]

function boundedShare(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))))
}

function consumeFirst(text: string, pattern: RegExp): { text: string; match?: RegExpMatchArray } {
  const match = text.match(pattern)
  return match ? { text: text.replace(match[0], " "), match } : { text }
}

function parseMiles(text: string): { text: string; minMiles?: number; maxMiles?: number } {
  let cleaned = text
  let minMiles: number | undefined
  let maxMiles: number | undefined

  const between = consumeFirst(cleaned,
    /\bbetween\s+(\d+(?:\.\d+)?)\s+(?:and|to)\s+(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i)
  cleaned = between.text
  if (between.match) {
    const left = Number(between.match[1])
    const right = Number(between.match[2])
    minMiles = Math.min(left, right)
    maxMiles = Math.max(left, right)
  } else {
    const range = consumeFirst(cleaned,
      /\b(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i)
    cleaned = range.text
    if (range.match) {
      const left = Number(range.match[1])
      const right = Number(range.match[2])
      minMiles = Math.min(left, right)
      maxMiles = Math.max(left, right)
    }
  }

  const minimum = consumeFirst(cleaned,
    /\b(?:over|above|more than|longer than|at least)\s+(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i)
  cleaned = minimum.text
  if (minimum.match) minMiles = Math.max(minMiles ?? 0, Number(minimum.match[1]))

  const maximum = consumeFirst(cleaned,
    /\b(?:under|below|less than|shorter than|at most)\s+(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i)
  cleaned = maximum.text
  if (maximum.match) maxMiles = Math.min(maxMiles ?? Number.POSITIVE_INFINITY, Number(maximum.match[1]))

  return { text: cleaned, minMiles, maxMiles }
}

function durationToMinutes(value: number, unit: string): number {
  return /h(?:ou)?r/i.test(unit) ? value * 60 : value
}

function parseDuration(text: string): { text: string; minMinutes?: number; maxMinutes?: number } {
  let cleaned = text
  let minMinutes: number | undefined
  let maxMinutes: number | undefined

  const between = consumeFirst(cleaned,
    /\bbetween\s+(\d+(?:\.\d+)?)\s+(?:and|to)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/i)
  cleaned = between.text
  if (between.match) {
    const left = durationToMinutes(Number(between.match[1]), between.match[3]!)
    const right = durationToMinutes(Number(between.match[2]), between.match[3]!)
    minMinutes = Math.min(left, right)
    maxMinutes = Math.max(left, right)
  }

  const minimum = consumeFirst(cleaned,
    /\b(?:over|above|more than|longer than|at least)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/i)
  cleaned = minimum.text
  if (minimum.match) {
    minMinutes = Math.max(minMinutes ?? 0, durationToMinutes(Number(minimum.match[1]), minimum.match[2]!))
  }

  const maximum = consumeFirst(cleaned,
    /\b(?:under|below|less than|shorter than|at most)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b/i)
  cleaned = maximum.text
  if (maximum.match) {
    maxMinutes = Math.min(
      maxMinutes ?? Number.POSITIVE_INFINITY,
      durationToMinutes(Number(maximum.match[1]), maximum.match[2]!)
    )
  }

  return { text: cleaned, minMinutes, maxMinutes }
}

function removePhrase(text: string, pattern: RegExp): { text: string; found: boolean } {
  const match = text.match(pattern)
  return match ? { text: text.replace(match[0], " "), found: true } : { text, found: false }
}

export function parseRideMemoryQuery(query: string): ParsedRideMemoryQuery {
  let cleaned = query.toLocaleLowerCase()
  let source: RideMemorySource | undefined
  let region: RideMemoryRegion | undefined

  for (const candidate of SOURCE_PATTERNS) {
    const result = consumeFirst(cleaned, candidate.pattern)
    if (!result.match) continue
    source = candidate.source
    cleaned = result.text
    break
  }

  for (const candidate of REGION_PATTERNS) {
    const result = consumeFirst(cleaned, candidate.pattern)
    if (!result.match) continue
    region = candidate.region
    cleaned = result.text
    break
  }

  const miles = parseMiles(cleaned)
  cleaned = miles.text
  const duration = parseDuration(cleaned)
  cleaned = duration.text

  let minTwistiness: number | undefined
  let minGravelShare: number | undefined
  let maxGravelShare: number | undefined
  let maxHighwayShare: number | undefined
  let requireTwistiness = false
  let requireGravel = false
  let sort: RideMemorySort = "stable"

  const twistiest = removePhrase(cleaned, /\b(?:twistiest|curviest|most twisty|most curvy|most curves)\b/i)
  cleaned = twistiest.text
  if (twistiest.found) {
    requireTwistiness = true
    sort = "twistiness-desc"
  }

  const twisty = removePhrase(cleaned, /\b(?:twisty|curvy)\b/i)
  cleaned = twisty.text
  if (twisty.found) {
    requireTwistiness = true
    minTwistiness = 0.55
    if (sort === "stable") sort = "twistiness-desc"
  }

  const gravelPercentMax = consumeFirst(cleaned,
    /\b(?:under|below|less than|at most)\s+(\d+(?:\.\d+)?)\s*%\s*gravel\b/i)
  cleaned = gravelPercentMax.text
  if (gravelPercentMax.match) maxGravelShare = boundedShare(Number(gravelPercentMax.match[1]) / 100)

  const gravelPercentMin = consumeFirst(cleaned,
    /\b(?:over|above|more than|at least)\s+(\d+(?:\.\d+)?)\s*%\s*gravel\b/i)
  cleaned = gravelPercentMin.text
  if (gravelPercentMin.match) {
    minGravelShare = boundedShare(Number(gravelPercentMin.match[1]) / 100)
    requireGravel = true
  }

  const noGravel = removePhrase(cleaned, /\b(?:no gravel|paved only|all paved)\b/i)
  cleaned = noGravel.text
  if (noGravel.found) maxGravelShare = Math.min(maxGravelShare ?? 1, 0.01)

  const littleGravel = removePhrase(cleaned, /\b(?:little gravel|low gravel|minimal gravel)\b/i)
  cleaned = littleGravel.text
  if (littleGravel.found) maxGravelShare = Math.min(maxGravelShare ?? 1, 0.15)

  const mostlyGravel = removePhrase(cleaned, /\b(?:mostly gravel|gravel heavy|gravel-heavy)\b/i)
  cleaned = mostlyGravel.text
  if (mostlyGravel.found) {
    minGravelShare = Math.max(minGravelShare ?? 0, 0.5)
    requireGravel = true
  }

  const graveliest = removePhrase(cleaned, /\b(?:graveliest|most gravel)\b/i)
  cleaned = graveliest.text
  if (graveliest.found) {
    requireGravel = true
    sort = "gravel-desc"
  }

  const standaloneGravel = removePhrase(cleaned, /\bgravel\b/i)
  cleaned = standaloneGravel.text
  if (standaloneGravel.found) {
    minGravelShare = Math.max(minGravelShare ?? 0, 0.05)
    requireGravel = true
  }

  const highwayPercentMax = consumeFirst(cleaned,
    /\b(?:under|below|less than|at most)\s+(\d+(?:\.\d+)?)\s*%\s*(?:highway|highways|motorway|motorways)\b/i)
  cleaned = highwayPercentMax.text
  if (highwayPercentMax.match) maxHighwayShare = boundedShare(Number(highwayPercentMax.match[1]) / 100)

  const avoidHighway = removePhrase(cleaned,
    /\b(?:no highways?|avoid highways?|little highways?|minimal highways?|no motorways?|avoid motorways?)\b/i)
  cleaned = avoidHighway.text
  if (avoidHighway.found) maxHighwayShare = Math.min(maxHighwayShare ?? 1, 0.05)

  const terms = cleaned
    .replace(/[^a-z0-9'-]+/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0 && !STOP_WORDS.has(term))

  const impossible = (
    miles.minMiles !== undefined && miles.maxMiles !== undefined && miles.minMiles > miles.maxMiles
  ) || (
    duration.minMinutes !== undefined && duration.maxMinutes !== undefined && duration.minMinutes > duration.maxMinutes
  ) || (
    minGravelShare !== undefined && maxGravelShare !== undefined && minGravelShare > maxGravelShare
  )

  return {
    ...(source ? { source } : {}),
    ...(region ? { region } : {}),
    ...(miles.minMiles !== undefined ? { minMiles: miles.minMiles } : {}),
    ...(miles.maxMiles !== undefined ? { maxMiles: miles.maxMiles } : {}),
    ...(duration.minMinutes !== undefined ? { minMinutes: duration.minMinutes } : {}),
    ...(duration.maxMinutes !== undefined ? { maxMinutes: duration.maxMinutes } : {}),
    ...(minTwistiness !== undefined ? { minTwistiness } : {}),
    ...(minGravelShare !== undefined ? { minGravelShare } : {}),
    ...(maxGravelShare !== undefined ? { maxGravelShare } : {}),
    ...(maxHighwayShare !== undefined ? { maxHighwayShare } : {}),
    requireTwistiness,
    requireGravel,
    sort,
    terms,
    impossible
  }
}

function fingerprintEvidenceKnown(
  fingerprint: RideFingerprint | undefined,
  axis: "twistiness" | "surface" | "roadClass"
): boolean {
  if (!fingerprint) return false
  if (fingerprint.evidence?.[axis] === false) return false
  if (axis === "twistiness") return Number.isFinite(fingerprint.twistiness)
  if (axis === "surface") return fingerprint.gravelShare !== null && Number.isFinite(fingerprint.gravelShare)
  return fingerprint.highwayShare !== null && Number.isFinite(fingerprint.highwayShare)
}

function matchesTerms(item: RideMemorySearchDocument, terms: readonly string[]): boolean {
  if (terms.length === 0) return true
  const haystack = [
    item.name,
    item.sourceLabel,
    item.tags.join(" "),
    item.roadNames?.join(" ") ?? "",
    item.region ?? ""
  ].join(" ").toLocaleLowerCase()
  return terms.every((term) => haystack.includes(term))
}

function matchesQuery(item: RideMemorySearchDocument, parsed: ParsedRideMemoryQuery): boolean {
  if (parsed.source && item.source !== parsed.source) return false
  if (parsed.region && item.region !== parsed.region) return false
  if (parsed.minMiles !== undefined && item.distanceMiles < parsed.minMiles) return false
  if (parsed.maxMiles !== undefined && item.distanceMiles > parsed.maxMiles) return false

  if (parsed.minMinutes !== undefined || parsed.maxMinutes !== undefined) {
    if (item.durationMinutes === null || !Number.isFinite(item.durationMinutes)) return false
    if (parsed.minMinutes !== undefined && item.durationMinutes < parsed.minMinutes) return false
    if (parsed.maxMinutes !== undefined && item.durationMinutes > parsed.maxMinutes) return false
  }

  const fingerprint = item.fingerprint
  if (parsed.requireTwistiness || parsed.minTwistiness !== undefined) {
    if (!fingerprintEvidenceKnown(fingerprint, "twistiness")) return false
    if (parsed.minTwistiness !== undefined && fingerprint!.twistiness < parsed.minTwistiness) return false
  }
  if (parsed.requireGravel || parsed.minGravelShare !== undefined || parsed.maxGravelShare !== undefined) {
    if (!fingerprintEvidenceKnown(fingerprint, "surface")) return false
    if (parsed.minGravelShare !== undefined && fingerprint!.gravelShare! < parsed.minGravelShare) return false
    if (parsed.maxGravelShare !== undefined && fingerprint!.gravelShare! > parsed.maxGravelShare) return false
  }
  if (parsed.maxHighwayShare !== undefined) {
    if (!fingerprintEvidenceKnown(fingerprint, "roadClass")) return false
    if (fingerprint!.highwayShare! > parsed.maxHighwayShare) return false
  }

  return matchesTerms(item, parsed.terms)
}

/**
 * Search compact ride evidence locally. Returned objects are always actual input
 * documents; this function cannot manufacture a route id or route geometry.
 */
export function searchRideMemory<T extends RideMemorySearchDocument>(
  items: readonly T[],
  query: string
): T[] {
  const parsed = parseRideMemoryQuery(query)
  if (parsed.impossible) return []

  const results = items.filter((item) => matchesQuery(item, parsed))
  const byId = (left: T, right: T) => left.id.localeCompare(right.id)

  if (parsed.sort === "twistiness-desc") {
    return results.sort((left, right) =>
      (right.fingerprint?.twistiness ?? -1) - (left.fingerprint?.twistiness ?? -1) || byId(left, right))
  }
  if (parsed.sort === "gravel-desc") {
    return results.sort((left, right) =>
      (right.fingerprint?.gravelShare ?? -1) - (left.fingerprint?.gravelShare ?? -1) || byId(left, right))
  }
  return results.sort(byId)
}
