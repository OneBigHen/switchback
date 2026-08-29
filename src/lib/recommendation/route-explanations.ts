import type { PlannedRoute, RouteCandidateSource } from "@/lib/routing/types"
import { formatDistanceMiles } from "@/lib/settings/rider-units"
import type { UnitSystem } from "@/lib/settings/rider-settings"

const UNPAVED_SURFACES = new Set([
  "compacted", "dirt", "earth", "fine_gravel", "grass", "gravel", "ground", "mud", "sand", "unpaved"
])
const BACKROAD_CLASSES = new Set(["secondary", "tertiary", "unclassified"])
const HIGHWAY_CLASSES = new Set(["motorway", "trunk"])

function distanceText(value: number, units: UnitSystem): string {
  const formatted = formatDistanceMiles(value, units)
  return `${formatted.value} ${formatted.unit}`.trim()
}

function shareTotal(mix: Record<string, number>): number {
  return Object.values(mix).reduce((sum, share) => sum + (Number.isFinite(share) ? Math.max(0, share) : 0), 0)
}

function shareFor(mix: Record<string, number>, accepted: Set<string>): number {
  return Object.entries(mix).reduce(
    (sum, [key, share]) => sum + (accepted.has(key.toLowerCase()) && Number.isFinite(share) ? Math.max(0, share) : 0),
    0
  )
}

function normalizedShare(mix: Record<string, number>, accepted: Set<string>): number {
  const total = shareTotal(mix)
  return total > 0 ? (shareFor(mix, accepted) / total) * 100 : 0
}

export function routeCharacterSummary(route: PlannedRoute, units: UnitSystem = "imperial"): string {
  const dominantRoad = Object.entries(route.roadMix)
    .filter(([, share]) => Number.isFinite(share) && share > 0)
    .sort((left, right) => right[1] - left[1])[0]
  const unpavedShare = normalizedShare(route.surfaceMix, UNPAVED_SURFACES)

  if (dominantRoad) {
    const [roadClass, share] = dominantRoad
    const roadTotal = shareTotal(route.roadMix)
    const normalizedRoadShare = roadTotal > 0 ? (share / roadTotal) * 100 : 0
    if (unpavedShare < 60 || normalizedRoadShare >= 50) {
      return `Mostly ${roadClass.replaceAll("_", " ")} roads (${Math.round(normalizedRoadShare)}%).`
    }
  }
  if (unpavedShare > 0 && route.distanceMiles > 0) {
    const distance = formatDistanceMiles(route.distanceMiles * unpavedShare / 100, units)
    return `${Math.round(unpavedShare)}% mapped gravel or unpaved surface (${distance.value} ${distance.unit}).`
  }
  if (route.turnCount > 0 && Number.isFinite(route.distanceMiles) && route.distanceMiles > 0) {
    const distance = formatDistanceMiles(route.distanceMiles, units)
    return `${route.turnCount} mapped turns across ${distance.value} ${distance.unit}.`
  }
  return "Route character is not mapped yet."
}

export function routeTradeoff(
  route: PlannedRoute,
  comparisonRoutes: readonly PlannedRoute[],
  units: UnitSystem = "imperial"
): string {
  const fastest = [...comparisonRoutes]
    .filter((candidate) => Number.isFinite(candidate.durationMinutes))
    .sort((left, right) => left.durationMinutes - right.durationMinutes)[0]
  if (!fastest || fastest.id === route.id) return "Fastest option"

  const durationDelta = route.durationMinutes - fastest.durationMinutes
  const distanceDelta = route.distanceMiles - fastest.distanceMiles
  const distance = Number.isFinite(distanceDelta)
    ? formatDistanceMiles(Math.abs(distanceDelta), units)
    : { value: "Unavailable", unit: "" }
  const distanceTradeoff = distance.value === "Unavailable"
    ? "distance unavailable vs fastest"
    : distanceDelta === 0
      ? "same distance as fastest"
      : `${distanceDelta > 0 ? "+" : "−"}${distance.value} ${distance.unit} vs fastest`
  if (!Number.isFinite(durationDelta) || Math.abs(durationDelta) < 0.5) {
    return `Same time as fastest · ${distanceTradeoff}`
  }
  const minutes = Math.round(Math.abs(durationDelta))
  return `${durationDelta > 0 ? "+" : "−"}${minutes} min · ${distanceTradeoff}`
}

function sourceFact(source: RouteCandidateSource | undefined): string | null {
  switch (source) {
    case "direct": return "Direct router candidate."
    case "native": return "Native router alternative."
    case "rig": return "Built from a verified RIG corridor anchor."
    case "community": return "Built from a community corridor anchor."
    case "road-character": return "Built from a mapped road-character corridor."
    case "loop-seed": return "Built from the requested loop seed."
    case "heading-sector": return "Built from a deterministic loop heading sector."
    default: return null
  }
}

/** Facts only: every sentence is derived from route fields or measured peers. */
export function explainRouteFacts(
  route: PlannedRoute,
  comparisonRoutes: readonly PlannedRoute[] = [],
  units: UnitSystem = "imperial"
): string[] {
  const facts: string[] = []
  const fastest = [...comparisonRoutes]
    .filter((candidate) => candidate.id !== route.id && candidate.durationMinutes < route.durationMinutes)
    .sort((left, right) => left.durationMinutes - right.durationMinutes)[0]
  if (fastest) {
    const minutes = Math.max(1, Math.round(route.durationMinutes - fastest.durationMinutes))
    facts.push(`Adds about ${minutes} minutes versus the fastest candidate.`)
  }

  const unpavedShare = normalizedShare(route.surfaceMix, UNPAVED_SURFACES)
  if (unpavedShare > 0 && route.distanceMiles > 0) {
    facts.push(`${distanceText(route.distanceMiles * unpavedShare / 100, units)} mapped gravel or unpaved surface.`)
  }
  const unknownSurfaceShare = normalizedShare(route.surfaceMix, new Set(["unknown"]))
  if (unknownSurfaceShare > 0 && route.distanceMiles > 0) {
    facts.push(`${Math.round(unknownSurfaceShare)}% of mapped surface coverage is unknown.`)
  }

  const backroadShare = shareFor(route.roadMix, BACKROAD_CLASSES)
  if (backroadShare > 0 && route.distanceMiles > 0) {
    facts.push(`${distanceText(route.distanceMiles * backroadShare / 100, units)} mapped secondary, tertiary, or unclassified road.`)
  }
  const highwayShare = shareFor(route.roadMix, HIGHWAY_CLASSES)
  if (highwayShare > 0 && route.distanceMiles > 0) {
    facts.push(`${distanceText(route.distanceMiles * highwayShare / 100, units)} mapped motorway or trunk road.`)
  }

  const source = sourceFact(route.candidateSource)
  if (source) facts.push(source)
  if (route.routeScore?.utility?.contiguousQualityBonus && route.routeScore.utility.contiguousQualityBonus > 0) {
    facts.push("Contains a sustained connected road-quality run.")
  }
  if (route.routeScore?.utility?.uncertaintyPenalty && route.routeScore.utility.uncertaintyPenalty >= 4) {
    facts.push("Some road-feature coverage is explicitly uncertain.")
  }
  return facts.slice(0, 5)
}
