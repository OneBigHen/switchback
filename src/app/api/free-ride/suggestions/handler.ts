import {
  array,
  enum_,
  number,
  object_,
  optional,
  safeParse,
  string,
  tuple,
  withDefault
} from "@/lib/validate"
import {
  buildGraphBackedFreeRideCandidates,
  rankFreeRideCandidates,
  type FreeRideRouteProvider
} from "@/lib/recommendation/free-ride"
import type { FreeRideGraphIndex } from "@/lib/recommendation/free-ride-graph"
import type { RideProfile } from "@/lib/domain/contracts"

const PROFILES = [
  "quick", "balanced", "twisty", "scenic", "adventure", "gravel", "avoid-highways", "neural"
] as const

const requestSchema = object_({
  position: tuple([
    number({ finite: true, min: -180, max: 180 }),
    number({ finite: true, min: -90, max: 90 })
  ]),
  headingDegrees: optional(number({ finite: true, min: 0, max: 360 })),
  gpsConfidence: withDefault(optional(number({ finite: true, min: 0, max: 1 })), 1),
  workload: withDefault(optional(enum_(["low", "normal", "high"] as const)), "low"),
  profile: withDefault(optional(enum_(PROFILES)), "neural"),
  speedMph: optional(number({ finite: true, min: 0, max: 200 })),
  cooldownUntil: optional(number({ finite: true, min: 0 })),
  rejectedCandidateIds: withDefault(optional(array(string({ trim: true, min: 1, max: 160 }), { max: 32 })), []),
  recentCandidateIds: withDefault(optional(array(string({ trim: true, min: 1, max: 160 }), { max: 32 })), []),
  recentSegmentUids: withDefault(optional(array(string({ trim: true, min: 1, max: 128 }), { max: 128 })), [])
})

async function readBody(request: Request): Promise<unknown | null> {
  try {
    const text = await request.text()
    if (text.length > 8 * 1024) return null
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export interface FreeRideSuggestionContext {
  graph?: FreeRideGraphIndex | null
  routeProvider?: FreeRideRouteProvider
  now?: () => string
}

export async function handleFreeRideSuggestions(
  request: Request,
  context: FreeRideSuggestionContext = {}
): Promise<Response> {
  const parsed = safeParse(requestSchema, await readBody(request))
  if (!parsed.success) {
    return Response.json({
      error: { code: "INVALID_FREE_RIDE_REQUEST", message: "Free Ride needs a valid GPS position and riding state." }
    }, { status: 400 })
  }

  const now = context.now?.() ?? new Date().toISOString()
  const rankingContext = {
    now,
    profile: parsed.data.profile as RideProfile,
    gpsConfidence: parsed.data.gpsConfidence ?? 1,
    workload: parsed.data.workload ?? "low",
    currentCoordinate: parsed.data.position,
    currentHeadingDegrees: parsed.data.headingDegrees ?? null,
    speedMph: parsed.data.speedMph,
    cooldownUntil: parsed.data.cooldownUntil,
    rejectedCandidateIds: new Set(parsed.data.rejectedCandidateIds),
    recentCandidateIds: new Set(parsed.data.recentCandidateIds),
    recentSegmentUids: new Set(parsed.data.recentSegmentUids)
  }

  // Suppression is safe to answer locally and must not require a graph or a
  // provider when the rider is uncertain or overloaded.
  const gate = rankFreeRideCandidates([], rankingContext)
  if (gate.suppressed && gate.suppressionReason !== "no-safe-candidate") {
    return Response.json(gate)
  }
  if (!context.graph) {
    return Response.json({
      error: {
        code: "FREE_RIDE_GRAPH_UNAVAILABLE",
        message: "Free Ride needs an installed verified RIG graph before it can offer a road."
      }
    }, { status: 503 })
  }
  if (!context.routeProvider) {
    return Response.json({
      error: {
        code: "FREE_RIDE_ROUTER_UNAVAILABLE",
        message: "Free Ride needs the routing engine to verify a detour and rejoin."
      }
    }, { status: 503 })
  }

  const built = await buildGraphBackedFreeRideCandidates(
    rankingContext,
    context.graph,
    context.routeProvider,
    { signal: request.signal }
  )
  if (built.candidates.length === 0 && built.providerFailures > 0) {
    return Response.json({
      error: {
        code: "FREE_RIDE_ROUTER_UNAVAILABLE",
        message: "Free Ride could not verify a detour with the routing engine."
      }
    }, { status: 503 })
  }
  return Response.json(rankFreeRideCandidates(built.candidates, rankingContext))
}
