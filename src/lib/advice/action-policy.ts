import type { AdviceRequest, AdvisorReply, ProposedRide, ProposedStop } from "./contracts"

/**
 * What the rider expects Gravel Goblin to *do* this turn.
 *
 * Execution mode answers "does the model need tools?". This answers a different
 * question: "is this an action command or a conversation?" Keeping the two
 * decisions separate lets ordinary questions remain suggestion-only while an
 * imperative like "reroute me with food" can hand a verified result back to
 * the planner instead of merely talking about it.
 */
export type AdvisorActionIntent =
  | "chat"
  | "reroute"
  | "route-with-stop"
  | "stop-scout"
  | "build-ride"

const ROUTE_ACTION = /\b(?:re-?route|reroute|better\s+(?:route|ride)|different\s+route|change\s+(?:the\s+)?route|route\s+me|take\s+me)\b/i
const STOP_NOUN = /\b(?:stop|stops|waypoint|coffee|cafe|café|food|eat|lunch|dinner|breakfast|brunch|brewery|beer|fuel|gas|charger|charging)\b/i
const APPLY_STOP = /\b(?:add|include|insert|put|via|through|with|route\s+me|stop\s+at)\b|\bon\s+the\s+way\b|\balong\s+the\s+way\b/i
const STOP_DISCOVERY = /\b(?:find|where|anywhere|somewhere|recommend|suggest|good|near|nearby|around|halfway|midway)\b/i

function messageOf(input: Pick<AdviceRequest, "riderMessage">): string {
  return input.riderMessage?.trim() ?? ""
}

export function classifyAdvisorAction(
  input: Pick<AdviceRequest, "context" | "riderMessage">
): AdvisorActionIntent {
  if (!input.context) return "build-ride"
  const message = messageOf(input)
  if (!message) return "chat"

  const wantsRouteChange = ROUTE_ACTION.test(message)
  const mentionsStop = STOP_NOUN.test(message)

  if (wantsRouteChange && mentionsStop) return "route-with-stop"
  if (mentionsStop && APPLY_STOP.test(message)) return "route-with-stop"
  if (wantsRouteChange) return "reroute"
  if (mentionsStop && STOP_DISCOVERY.test(message)) return "stop-scout"
  return "chat"
}

/**
 * Extra model instructions for action turns. These improve tool use, but they
 * are not the safety boundary: `enforceAdvisorActionReply` below rewrites
 * action copy from resolved structured evidence after the model returns.
 */
export function advisorActionPrompt(
  input: Pick<AdviceRequest, "context" | "riderMessage">
): string {
  switch (classifyAdvisorAction(input)) {
    case "route-with-stop":
      return [
        "ACTION CONTRACT: the rider asked to change the ride and include a stop.",
        "Use find_stops (or lookup_place for a specifically named place) before naming a stop.",
        "Put the best grounded stop first in proposedStops so the planner can route through it.",
        "Do not invent an itinerary, road, town or business when lookup fails.",
        "Do not claim the route or map changed; the client owns planner mutation after validation."
      ].join("\n")
    case "reroute":
      return [
        "ACTION CONTRACT: the rider explicitly asked for a better/different route.",
        "Choose only among the route candidates Switchback already produced, using secondOpinion.",
        "A different route id is required to call it a reroute; never narrate an imaginary route.",
        "Do not claim the map changed; the client owns selection after validation."
      ].join("\n")
    case "stop-scout":
      return [
        "ACTION CONTRACT: this is stop discovery, not permission to change the ride.",
        "Call find_stops before naming a business and return grounded matches in proposedStops.",
        "Do not name a business that did not come back from place search."
      ].join("\n")
    case "build-ride":
      return [
        "ACTION CONTRACT: there is no route yet, so return a fully grounded proposedRide when possible.",
        "Do not describe a made-up route as though it has been planned."
      ].join("\n")
    case "chat":
      return ""
  }
}

const MAX_ACTION_WORDS = 80

function compactWords(text: string, maxWords = MAX_ACTION_WORDS): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.slice(0, maxWords).join(" ")
}

function safeStopReason(stop: ProposedStop): string {
  if (stop.routeProgress === null) return `Mapped ${stop.kind} stop near the ride.`
  return `Mapped ${stop.kind} stop around ${Math.round(stop.routeProgress * 100)}% along the route.`
}

function safeStops(stops: readonly ProposedStop[]): ProposedStop[] {
  return stops.map((stop) => ({ ...stop, reason: safeStopReason(stop) }))
}

function safeRideSummary(ride: ProposedRide): string {
  const visitPoints = ride.waypoints.filter((point) => point.role !== "road-evidence")
  const via = visitPoints.length > 0 ? ` via ${visitPoints.map((point) => point.name).join(", ")}` : ""
  const duration = ride.targetMinutes === null ? "" : `${ride.targetMinutes}-minute `
  if (ride.mode === "loop") return `${duration}${ride.profile} loop from ${ride.start.name}${via}`
  return `${duration}${ride.profile} ride: ${ride.start.name} → ${ride.finish?.name ?? "destination"}${via}`
}

function safeRide(ride: ProposedRide): ProposedRide {
  return { ...ride, summary: safeRideSummary(ride) }
}

/**
 * Evidence gate for rider-facing action copy.
 *
 * Structured stops and route ids are already validated by `resolve-answer`.
 * The model's free-text fields were the remaining escape hatch: a `message`,
 * stop `reason`, route-opinion `rationale`, or ride `summary` could still name
 * an invented place even when its structured id was rejected. Action turns
 * therefore get deterministic copy built only from resolved structures.
 * Generic conversation keeps the model's voice, but is still capped so Goblin
 * does not bury the map under a monologue.
 */
export function enforceAdvisorActionReply(input: AdviceRequest, reply: AdvisorReply): AdvisorReply {
  if (reply.status !== "ok") return reply

  const intent = classifyAdvisorAction(input)
  if (intent === "chat") return { ...reply, message: compactWords(reply.message) }

  if (intent === "route-with-stop" || intent === "stop-scout") {
    const proposedStops = safeStops(reply.proposedStops)
    const stop = proposedStops[0]
    if (!stop) {
      const message = intent === "route-with-stop"
        ? "I couldn’t ground a routable stop for that request, so I left the route unchanged."
        : "I couldn’t ground a useful stop from the available place search."
      return {
        ...reply,
        message,
        secondOpinion: null,
        proposedStops: [],
        proposedRide: null
      }
    }
    return {
      ...reply,
      message: intent === "route-with-stop"
        ? `Grounded stop: ${stop.name}. It’s ready to route through.`
        : `Best grounded stop: ${stop.name}.`,
      secondOpinion: null,
      proposedStops,
      proposedRide: null
    }
  }

  if (intent === "reroute") {
    const opinion = reply.secondOpinion
    const selectedId = input.context?.selectedRouteId
    const isDifferent = opinion
      && !opinion.agreesWithSwitchback
      && opinion.wouldPick !== selectedId
    const candidate = isDifferent
      ? input.context?.candidates.find((entry) => entry.id === opinion.wouldPick)
      : null

    if (!candidate || !opinion) {
      return {
        ...reply,
        message: "I don’t have a better verified route candidate than the one already selected.",
        secondOpinion: null,
        proposedStops: [],
        proposedRide: null
      }
    }

    const selected = input.context?.candidates.find((entry) => entry.id === selectedId)
    const timeDelta = selected ? candidate.durationMinutes - selected.durationMinutes : 0
    const timeText = timeDelta === 0
      ? "the same measured time"
      : timeDelta > 0
        ? `${timeDelta} min longer`
        : `${Math.abs(timeDelta)} min quicker`
    const rationale = `${candidate.distanceMiles} mi · ${candidate.durationMinutes} min · curve score ${candidate.twistiness}/100 · ${timeText}.`

    return {
      ...reply,
      message: `Better verified candidate: ${candidate.name}. It’s ready to show on the map.`,
      secondOpinion: { ...opinion, rationale, cautions: [] },
      proposedStops: [],
      proposedRide: null
    }
  }

  if (intent === "build-ride") {
    const proposedRide = reply.proposedRide ? safeRide(reply.proposedRide) : null
    return {
      ...reply,
      message: proposedRide
        ? proposedRide.summary
        : "I couldn’t build a fully grounded ride from that request yet.",
      secondOpinion: null,
      proposedRide
    }
  }

  return { ...reply, message: compactWords(reply.message) }
}

export type AdvisorClientAction =
  | { type: "add-stop"; stop: ProposedStop }
  | { type: "select-route"; routeId: string }

/**
 * Turn a validated action reply into the existing planner callback to invoke.
 * Exploratory questions deliberately return null so asking "any coffee?" does
 * not mutate the rider's route without an imperative.
 */
export function resolveAdvisorClientAction(
  input: AdviceRequest,
  reply: AdvisorReply
): AdvisorClientAction | null {
  if (reply.status !== "ok") return null
  const intent = classifyAdvisorAction(input)

  if (intent === "route-with-stop") {
    const stop = reply.proposedStops[0]
    return stop ? { type: "add-stop", stop } : null
  }

  if (intent === "reroute" && reply.secondOpinion && !reply.secondOpinion.agreesWithSwitchback) {
    const routeId = reply.secondOpinion.wouldPick
    const exists = input.context?.candidates.some((candidate) => candidate.id === routeId) === true
    if (exists && routeId !== input.context?.selectedRouteId) return { type: "select-route", routeId }
  }

  return null
}
