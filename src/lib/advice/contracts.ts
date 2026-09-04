import type { PlannedRoute } from "@/lib/routing/types"

/**
 * The route advisor's typed surface.
 *
 * The advisor is a **proposer**, never a decider (ADR 0001). Everything in this
 * file is shaped so that boundary is enforced by types and by the module that
 * resolves them — not by prompt wording:
 *
 * - `RouteSecondOpinion.wouldPick` is an id from the candidate set Switchback
 *   already produced. A model-invented id is rejected, not rendered.
 * - `ProposedStop.anchor` is never taken from model text. The model may only
 *   reference a `placeId` that a grounding tool actually returned; this module
 *   resolves the coordinates. A hallucinated place cannot become a waypoint.
 * - Nothing here can reorder candidates, change a score, or select a route. An
 *   accepted stop re-enters planning as an ordinary rider-chosen waypoint
 *   through the existing request builder.
 */

export type AdvisorStatus =
  | "ok"
  | "no-key"
  | "disabled"
  | "timeout"
  | "unavailable"
  | "malformed"

/** One line of the conversation. The client owns the transcript; the API is stateless. */
export interface AdvisorMessage {
  role: "rider" | "advisor"
  text: string
}

/** A source the advisor actually consulted. Rendered verbatim beside its claim. */
export interface GroundingCitation {
  /** Display name exactly as the source supplied it. */
  title: string
  url: string
  /** Which grounding source produced it; drives the required attribution copy. */
  source: GroundingSourceId
}

export type GroundingSourceId = "switchback-local" | "google-maps"

export type ProposedStopKind =
  | "brewery"
  | "coffee"
  | "food"
  | "fuel"
  | "scenic"
  | "road"

/**
 * A place the advisor thinks belongs on this ride. It is a *suggestion*: the
 * rider taps to accept, and only then does it become a waypoint on a normal
 * planning request.
 */
export interface ProposedStop {
  id: string
  name: string
  /** One line on why it belongs on *this* ride. */
  reason: string
  kind: ProposedStopKind
  /** Resolved from a grounding tool result — never from model prose. */
  anchor: { lat: number; lon: number }
  /** Position along the chosen route, 0 (start) to 1 (finish); null when unknown. */
  routeProgress: number | null
  citations: GroundingCitation[]
}

/**
 * An independent read of the decision Switchback already made. Explanation
 * only: it cannot introduce a route, and `wouldPick` must name one of the
 * candidates Switchback produced.
 */
export interface RouteSecondOpinion {
  agreesWithSwitchback: boolean
  /** A routeId from the existing candidate set. */
  wouldPick: string
  rationale: string
  cautions: string[]
  confidence: "low" | "medium" | "high"
}

export interface AdvisorReply {
  status: AdvisorStatus
  /** The advisor's prose. Never a route, never a score. */
  message: string
  secondOpinion: RouteSecondOpinion | null
  proposedStops: ProposedStop[]
  citations: GroundingCitation[]
  /** What the turn cost, for the call budget and for honest UI. */
  usage: { toolCalls: number; groundedQueries: number }
}

export function emptyReply(status: AdvisorStatus, message = ""): AdvisorReply {
  return {
    status,
    message,
    secondOpinion: null,
    proposedStops: [],
    citations: [],
    usage: { toolCalls: 0, groundedQueries: 0 }
  }
}

/** The ride the conversation is about. Facts only — see route-context.ts. */
export interface AdvisorRouteContext {
  /** The route the rider is currently looking at. */
  selectedRouteId: string
  /** Every candidate Switchback produced, in the order it offered them. */
  candidates: Array<Pick<PlannedRoute,
    | "id"
    | "name"
    | "profile"
    | "distanceMiles"
    | "durationMinutes"
    | "twistiness"
    | "turnCount"
    | "roadMix"
    | "surfaceMix"
  >>
  /** Sampled geometry of the selected route, for along-route grounding. */
  geometry: Array<[longitude: number, latitude: number]>
  /** Warnings Switchback already surfaced; the advisor must not contradict them. */
  warnings: string[]
}

export interface AdviceRequest {
  context: AdvisorRouteContext
  /** Prior turns. Empty on the opening "second opinion" call. */
  conversation: AdvisorMessage[]
  /** The rider's newest message; absent means "give me your opening read". */
  riderMessage?: string
}

export interface RouteAdviser {
  advise(input: AdviceRequest, signal?: AbortSignal): Promise<AdvisorReply>
}

/* ------------------------------------------------------------------ */
/* Grounding                                                           */
/* ------------------------------------------------------------------ */

/** A place a grounding tool actually returned. The only stops that may be proposed. */
export interface GroundedPlace {
  /** Stable within one turn; the model references this id, never coordinates. */
  placeId: string
  name: string
  kind: ProposedStopKind
  lat: number
  lon: number
  /** Free-text detail the source supplied (hours, character, rating context). */
  detail?: string
  citations: GroundingCitation[]
}

export interface GroundingResult {
  /** JSON handed back to the model as the tool result. */
  content: unknown
  /** Places named by this result, addressable by `placeId`. */
  places: GroundedPlace[]
  citations: GroundingCitation[]
}

/** An OpenAI-shaped tool definition; OpenRouter passes these through unchanged. */
export interface AdvisorToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/**
 * Where the advisor's facts come from. Pluggable on purpose: the default is
 * key-free and built on data Switchback already holds, and Google Maps
 * grounding is an optional, separately-gated source with its own attribution
 * obligations (see google-maps-grounding.ts).
 */
export interface GroundingSource {
  readonly id: GroundingSourceId
  /** Attribution line that must be rendered whenever this source is cited. */
  readonly attribution: string | null
  tools(context: AdvisorRouteContext): AdvisorToolDefinition[]
  call(
    name: string,
    args: Record<string, unknown>,
    context: AdvisorRouteContext,
    signal?: AbortSignal
  ): Promise<GroundingResult>
}
