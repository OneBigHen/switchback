import type { PlannedRoute, RouteCandidateSource } from "@/lib/routing/types"

const UNPAVED_SURFACES = new Set([
  "compacted", "dirt", "earth", "fine_gravel", "grass", "gravel", "ground", "mud", "sand", "unpaved"
])
const BACKROAD_CLASSES = new Set(["secondary", "tertiary", "unclassified"])
const HIGHWAY_CLASSES = new Set(["motorway", "trunk"])

function miles(value: number): string {
  return value.toFixed(1)
}

function shareFor(mix: Record<string, number>, accepted: Set<string>): number {
  return Object.entries(mix).reduce(
    (sum, [key, share]) => sum + (accepted.has(key.toLowerCase()) ? Math.max(0, share) : 0),
    0
  )
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
  comparisonRoutes: readonly PlannedRoute[] = []
): string[] {
  const facts: string[] = []
  const fastest = [...comparisonRoutes]
    .filter((candidate) => candidate.id !== route.id && candidate.durationMinutes < route.durationMinutes)
    .sort((left, right) => left.durationMinutes - right.durationMinutes)[0]
  if (fastest) {
    const minutes = Math.max(1, Math.round(route.durationMinutes - fastest.durationMinutes))
    facts.push(`Adds about ${minutes} minutes versus the fastest candidate.`)
  }

  const unpavedShare = shareFor(route.surfaceMix, UNPAVED_SURFACES)
  if (unpavedShare > 0 && route.distanceMiles > 0) {
    facts.push(`${miles(route.distanceMiles * unpavedShare / 100)} mi mapped gravel or unpaved surface.`)
  }
  const unknownSurfaceShare = shareFor(route.surfaceMix, new Set(["unknown"]))
  if (unknownSurfaceShare > 0 && route.distanceMiles > 0) {
    facts.push(`${Math.round(unknownSurfaceShare)}% of mapped surface coverage is unknown.`)
  }

  const backroadShare = shareFor(route.roadMix, BACKROAD_CLASSES)
  if (backroadShare > 0 && route.distanceMiles > 0) {
    facts.push(`${miles(route.distanceMiles * backroadShare / 100)} mi mapped secondary, tertiary, or unclassified road.`)
  }
  const highwayShare = shareFor(route.roadMix, HIGHWAY_CLASSES)
  if (highwayShare > 0 && route.distanceMiles > 0) {
    facts.push(`${miles(route.distanceMiles * highwayShare / 100)} mi mapped motorway or trunk road.`)
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
