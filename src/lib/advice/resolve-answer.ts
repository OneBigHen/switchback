import type { Coordinate, RouteProfileId } from "@/lib/routing/types"
import { routeProgressOf } from "./toolbox"
import type {
  AdvisorReply,
  GroundedPlace,
  ProposedRide,
  ProposedRidePoint,
  ProposedStop,
  RouteSecondOpinion
} from "./contracts"

/**
 * Where the advisor's boundaries are actually enforced.
 *
 * The model produces a JSON document. Nothing in it is trusted:
 *
 * - A route id it names must be one Switchback produced.
 * - A place it references must be a `placeId` a tool returned *this turn*, and
 *   the coordinates come from that tool result. The model never supplies a
 *   latitude, so a hallucinated place is simply unresolvable and disappears.
 * - Every numeric planner input is range-checked against the same bounds the
 *   API boundary enforces, and out-of-range values are dropped rather than
 *   clamped-and-hoped.
 *
 * This is the ADR 0001 line in code: the advisor helps fill in the form, and
 * the form is validated before anyone sees it.
 */

export const MAX_PROPOSED_STOPS = 3
/** The request builder caps a ride at 8 points, so 6 shaping stops at most. */
export const MAX_PROPOSED_WAYPOINTS = 4
const MIN_TARGET_MINUTES = 20
const MAX_TARGET_MINUTES = 480

const PROFILES: readonly RouteProfileId[] = [
  "quick", "balanced", "twisty", "scenic", "adventure", "gravel", "avoid-highways", "neural"
]

export const FINAL_ANSWER_SCHEMA = {
  type: "object",
  required: ["message"],
  properties: {
    message: {
      type: "string",
      description: "What you'd tell the rider, in your own voice. Two or three sentences."
    },
    secondOpinion: {
      type: "object",
      description: "Your read on the route Switchback picked. Omit when there is no route yet.",
      required: ["agreesWithSwitchback", "wouldPick", "rationale", "confidence"],
      properties: {
        agreesWithSwitchback: { type: "boolean" },
        wouldPick: { type: "string", description: "A route id from the briefing. Never a new route." },
        rationale: { type: "string" },
        cautions: { type: "array", items: { type: "string" } },
        confidence: { type: "string", enum: ["low", "medium", "high"] }
      }
    },
    proposedStops: {
      type: "array",
      description: "Stops worth taking. Only placeIds a tool returned to you.",
      items: {
        type: "object",
        required: ["placeId", "reason"],
        properties: {
          placeId: { type: "string" },
          reason: { type: "string", description: "Why it belongs on this ride specifically." }
        }
      }
    },
    proposedRide: {
      type: "object",
      description:
        "A whole ride, when the rider asked you to put one together. Every point is a " +
        "placeId a tool returned. The rider confirms this before anything is routed.",
      required: ["mode", "profile", "startPlaceId", "summary"],
      properties: {
        mode: { type: "string", enum: ["destination", "loop"] },
        profile: {
          type: "string",
          enum: [...PROFILES],
          description:
            "adventure or gravel for dual-sport riding on mixed surfaces; twisty for maximum " +
            "corners on pavement; scenic for back roads."
        },
        targetMinutes: { type: "integer", description: "20 to 480. Required for a loop." },
        startPlaceId: { type: "string" },
        finishPlaceId: { type: "string", description: "Omit for a loop." },
        waypointPlaceIds: { type: "array", items: { type: "string" } },
        avoidHighways: { type: "boolean" },
        tollPolicy: { type: "string", enum: ["allow-with-warning", "avoid"] },
        summary: { type: "string", description: "One line the rider can sanity-check the plan against." }
      }
    }
  }
} as const

function textOf(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, max) : null
}

/**
 * Accept a second opinion only when it points at a route Switchback actually
 * produced. This is the "no LLM route ranker" boundary in code: the advisor
 * may disagree, but only about routes that already exist.
 */
export function resolveSecondOpinion(
  raw: unknown,
  candidateIds: readonly string[]
): RouteSecondOpinion | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const wouldPick = textOf(value.wouldPick, 200)
  if (!wouldPick || !candidateIds.includes(wouldPick)) return null
  const rationale = textOf(value.rationale, 400)
  if (!rationale) return null
  const confidence = value.confidence
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") return null
  const cautions = Array.isArray(value.cautions)
    ? value.cautions.flatMap((caution) => {
        const text = textOf(caution, 200)
        return text ? [text] : []
      }).slice(0, 3)
    : []
  return {
    agreesWithSwitchback: value.agreesWithSwitchback === true,
    wouldPick,
    rationale,
    cautions,
    confidence
  }
}

/**
 * Turn `placeId` references into stops. A reference no tool produced is
 * dropped: the model never supplies coordinates, so it cannot invent a
 * waypoint.
 */
export function resolveProposedStops(
  raw: unknown,
  places: ReadonlyMap<string, GroundedPlace>,
  geometry: readonly Coordinate[]
): ProposedStop[] {
  if (!Array.isArray(raw)) return []
  const stops: ProposedStop[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (stops.length >= MAX_PROPOSED_STOPS) break
    if (!entry || typeof entry !== "object") continue
    const value = entry as Record<string, unknown>
    const placeId = textOf(value.placeId, 200)
    const reason = textOf(value.reason, 200)
    if (!placeId || !reason || seen.has(placeId)) continue
    const place = places.get(placeId)
    if (!place) continue
    seen.add(placeId)
    stops.push({
      id: place.placeId,
      name: place.name,
      reason,
      kind: place.kind,
      anchor: { lat: place.lat, lon: place.lon },
      routeProgress: routeProgressOf({ lat: place.lat, lon: place.lon }, geometry),
      citations: place.citations
    })
  }
  return stops
}

function ridePoint(place: GroundedPlace): ProposedRidePoint {
  return { name: place.name, lat: place.lat, lon: place.lon }
}

/**
 * Resolve a whole proposed ride. Every point must come from a tool, the
 * profile must be one Switchback has, and the time target must sit inside the
 * range the request builder already enforces. A ride that fails any of those
 * is dropped entirely rather than silently repaired — a half-understood plan
 * is worse than none.
 */
export function resolveProposedRide(
  raw: unknown,
  places: ReadonlyMap<string, GroundedPlace>
): ProposedRide | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>

  const mode = value.mode === "loop" ? "loop" : value.mode === "destination" ? "destination" : null
  if (!mode) return null
  const profile = PROFILES.find((candidate) => candidate === value.profile)
  if (!profile) return null
  const summary = textOf(value.summary, 240)
  if (!summary) return null

  const start = places.get(textOf(value.startPlaceId, 200) ?? "")
  if (!start) return null

  const finishId = textOf(value.finishPlaceId, 200)
  const finish = mode === "destination" && finishId ? places.get(finishId) : undefined
  // A destination ride without a resolvable finish is not a ride.
  if (mode === "destination" && !finish) return null

  const rawMinutes = Number(value.targetMinutes)
  const targetMinutes = Number.isInteger(rawMinutes)
    && rawMinutes >= MIN_TARGET_MINUTES && rawMinutes <= MAX_TARGET_MINUTES
    ? rawMinutes
    : null
  // Loops are timeboxed by definition; without a usable target there is no loop.
  if (mode === "loop" && targetMinutes === null) return null

  const waypointIds = Array.isArray(value.waypointPlaceIds) ? value.waypointPlaceIds : []
  const seen = new Set<string>([start.placeId, ...(finish ? [finish.placeId] : [])])
  const waypoints: ProposedRidePoint[] = []
  for (const entry of waypointIds) {
    if (waypoints.length >= MAX_PROPOSED_WAYPOINTS) break
    const id = textOf(entry, 200)
    if (!id || seen.has(id)) continue
    const place = places.get(id)
    if (!place) continue
    seen.add(id)
    waypoints.push(ridePoint(place))
  }

  return {
    mode,
    profile,
    targetMinutes,
    start: ridePoint(start),
    finish: finish ? ridePoint(finish) : null,
    waypoints,
    avoidHighways: value.avoidHighways === true,
    tollPolicy: value.tollPolicy === "avoid" ? "avoid" : "allow-with-warning",
    summary
  }
}

export interface ResolveContext {
  candidateIds: readonly string[]
  places: ReadonlyMap<string, GroundedPlace>
  geometry: readonly Coordinate[]
}

/** Parse and validate the model's whole answer, or return null. */
export function resolveFinalAnswer(
  text: string | undefined,
  context: ResolveContext
): Omit<AdvisorReply, "status" | "citations" | "usage"> | null {
  if (!text) return null
  let answer: Record<string, unknown>
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== "object") return null
    answer = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const message = textOf(answer.message, 900)
  if (!message) return null
  return {
    message,
    secondOpinion: resolveSecondOpinion(answer.secondOpinion, context.candidateIds),
    proposedStops: resolveProposedStops(answer.proposedStops, context.places, context.geometry),
    proposedRide: resolveProposedRide(answer.proposedRide, context.places)
  }
}
