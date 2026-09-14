import { haversine } from "./scoring"
import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"

export const ENGINE_ALTERNATES_MAX_CROW_MILES = 60

export type AlternativesStrategy = "engine-alternates" | "lane-search"

type StrategyRequest = Pick<NormalizedRouteRequest, "points" | "sketchCorridor">

function configuredMaximumMiles(): number {
  const raw = process.env.ROUTING_ENGINE_ALTERNATES_MAX_MILES
  if (!raw || raw.trim().length === 0) return ENGINE_ALTERNATES_MAX_CROW_MILES
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : ENGINE_ALTERNATES_MAX_CROW_MILES
}

function straightLineMiles(request: StrategyRequest): number {
  const first = request.points[0]
  const last = request.points.at(-1)
  if (!first || !last) return Number.POSITIVE_INFINITY
  return haversine([first.lon, first.lat], [last.lon, last.lat]) / 1_609.344
}

/** Keep provider-native alternate generation bounded to short direct trips. */
export function chooseAlternativesStrategy(request: StrategyRequest): AlternativesStrategy {
  if (request.points.length !== 2 || request.sketchCorridor?.length) return "lane-search"
  return straightLineMiles(request) <= configuredMaximumMiles()
    ? "engine-alternates"
    : "lane-search"
}
