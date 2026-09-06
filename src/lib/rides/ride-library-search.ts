import {
  rideRegionMatches,
  type RideRegionFilter,
  type RideRegionSummary
} from "@/lib/rides/route-library-intelligence"

export type RideLibrarySearchKind = "saved-route" | "recorded-ride" | "trip-plan" | "project-gpx"

export interface RideLibrarySearchDocument {
  id: string
  kind: RideLibrarySearchKind
  name: string
  sourceLabel: string
  distanceMiles: number
  tags: string[]
  roadNames?: string[]
  region?: RideRegionSummary
}

export interface ParsedRideLibraryQuery {
  region: RideRegionFilter | undefined
  minMiles: number | undefined
  maxMiles: number | undefined
  kind: RideLibrarySearchKind | undefined
  terms: string[]
}

const STOP_WORDS = new Set([
  "a", "all", "and", "around", "find", "for", "from", "in", "me", "mile", "miles",
  "my", "of", "on", "pa", "pennsylvania", "please", "ride", "rides", "route", "routes",
  "show", "some", "that", "the", "through", "with"
])

const REGION_PATTERNS: ReadonlyArray<{ id: RideRegionFilter; pattern: RegExp }> = [
  { id: "cross", pattern: /\b(?:cross[ -]?region|crossing regions)\b/i },
  { id: "outside", pattern: /\b(?:outside pa|outside pennsylvania)\b/i },
  { id: "ne", pattern: /\b(?:ne|northeast|north east)\b/i },
  { id: "nw", pattern: /\b(?:nw|northwest|north west)\b/i },
  { id: "se", pattern: /\b(?:se|southeast|south east)\b/i },
  { id: "sw", pattern: /\b(?:sw|southwest|south west)\b/i }
]

const KIND_PATTERNS: ReadonlyArray<{ id: RideLibrarySearchKind; pattern: RegExp }> = [
  { id: "recorded-ride", pattern: /\b(?:recorded|recording|ridden)\b/i },
  { id: "saved-route", pattern: /\b(?:saved|planned)\b/i },
  { id: "trip-plan", pattern: /\b(?:trip|trips)\b/i },
  { id: "project-gpx", pattern: /\b(?:imported|gpx)\b/i }
]

function extractRange(text: string): { minMiles?: number; maxMiles?: number; cleaned: string } {
  const between = text.match(/\bbetween\s+(\d+(?:\.\d+)?)\s+(?:and|to)\s+(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)?\b/i)
    ?? text.match(/\b(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i)
  if (between) {
    const left = Number(between[1])
    const right = Number(between[2])
    return {
      minMiles: Math.min(left, right),
      maxMiles: Math.max(left, right),
      cleaned: text.replace(between[0], " ")
    }
  }

  const maximum = text.match(/\b(?:under|below|less than|shorter than|at most)\s+(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)?\b/i)
  if (maximum) {
    return { maxMiles: Number(maximum[1]), cleaned: text.replace(maximum[0], " ") }
  }

  const minimum = text.match(/\b(?:over|above|more than|longer than|at least)\s+(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)?\b/i)
  if (minimum) {
    return { minMiles: Number(minimum[1]), cleaned: text.replace(minimum[0], " ") }
  }

  return { cleaned: text }
}

export function parseRideLibraryQuery(query: string): ParsedRideLibraryQuery {
  let cleaned = query.toLocaleLowerCase()
  let region: RideRegionFilter | undefined
  let kind: RideLibrarySearchKind | undefined

  for (const candidate of REGION_PATTERNS) {
    const match = cleaned.match(candidate.pattern)
    if (!match) continue
    region = candidate.id
    cleaned = cleaned.replace(match[0], " ")
    break
  }

  for (const candidate of KIND_PATTERNS) {
    const match = cleaned.match(candidate.pattern)
    if (!match) continue
    kind = candidate.id
    cleaned = cleaned.replace(match[0], " ")
    break
  }

  const range = extractRange(cleaned)
  cleaned = range.cleaned
  const terms = cleaned
    .replace(/[^a-z0-9'-]+/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0 && !STOP_WORDS.has(term))

  return {
    region,
    minMiles: range.minMiles,
    maxMiles: range.maxMiles,
    kind,
    terms
  }
}

export function searchRideLibrary<T extends RideLibrarySearchDocument>(items: readonly T[], query: string): T[] {
  const parsed = parseRideLibraryQuery(query)
  if (!query.trim()) return [...items]

  return items.filter((item) => {
    if (parsed.kind && item.kind !== parsed.kind) return false
    if (parsed.region && !rideRegionMatches(item.region, parsed.region)) return false
    if (parsed.minMiles !== undefined && item.distanceMiles < parsed.minMiles) return false
    if (parsed.maxMiles !== undefined && item.distanceMiles > parsed.maxMiles) return false

    if (parsed.terms.length === 0) return true
    const haystack = [
      item.name,
      item.sourceLabel,
      item.tags.join(" "),
      item.roadNames?.join(" ") ?? "",
      item.region?.label ?? ""
    ].join(" ").toLocaleLowerCase()
    return parsed.terms.every((term) => haystack.includes(term))
  })
}
