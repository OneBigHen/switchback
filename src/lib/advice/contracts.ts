import type { PlannedRoute, RouteProfileId } from "@/lib/routing/types"

/**
 * The route advisor's typed surface.
 *
 * The advisor is a **proposer**, never a decider (ADR 0001). Everything in this
 * file is shaped so that boundary is enforced by types and by the resolvers —
 * not by prompt wording:
 *
 * - `RouteSecondOpinion.wouldPick` is an id from the candidate set Switchback
 *   already produced. A model-invented id is rejected, not rendered.
 * - Every coordinate the advisor emits — a stop, a start, a destination — comes
 *   from a tool result Switchback resolved through its own geocoder. The model
 *   references a `placeId`; it never supplies a latitude. A hallucinated place
 *   cannot be resolved, so it cannot become a waypoint.
 * - A proposed ride is a *filled-in form*: profile, minutes, waypoints. It is
 *   rendered as the planner's own editable controls and routes only when the
 *   rider presses Plan. Nothing here reorders candidates or touches a score.
 */

export type AdvisorStatus =
  | "ok"
  | "no-key"
  | "disabled"
  | "timeout"
  | "unavailable"
  | "malformed"
  | "rate-limited"

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
  /** Resolved by Switchback's geocoder — never taken from model prose. */
  anchor: { lat: number; lon: number }
  /** Position along the chosen route, 0 (start) to 1 (finish); null when unknown. */
  routeProgress: number | null
  citations: GroundingCitation[]
}

/**
 * A whole ride the advisor filled in from the conversation.
 *
 * This is the intent-shaping surface: structured, bounded, rider-visible
 * *inputs* to the existing request builder — not a route. Every field already
 * exists on `RouteRequest`, every coordinate came from the geocoder, and the
 * rider sees and can edit all of it before anything is routed.
 */
export interface ProposedRide {
  mode: "destination" | "loop"
  profile: RouteProfileId
  /** Ride length target in minutes; loops require it, destinations may set it. */
  targetMinutes: number | null
  start: ProposedRidePoint
  /** Absent for a loop, which returns to its start. */
  finish: ProposedRidePoint | null
  /** Shaping stops in ride order; bounded by the request builder's own cap. */
  waypoints: ProposedRidePoint[]
  avoidHighways: boolean
  tollPolicy: "allow-with-warning" | "avoid"
  /** One line the rider can check the whole plan against. */
  summary: string
}

export interface ProposedRidePoint {
  name: string
  lat: number
  lon: number
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
  /** A ride the rider can send straight to the planner, when one was asked for. */
  proposedRide: ProposedRide | null
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
    proposedRide: null,
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
  > & { corridorOption?: string }>
  /** Sampled geometry of the selected route, for along-route grounding. */
  geometry: Array<[longitude: number, latitude: number]>
  /** Warnings Switchback already surfaced; the advisor must not contradict them. */
  warnings: string[]
}

/** Where the rider is, when they let Switchback know. Biases place search. */
export interface AdvisorOrigin {
  lat: number
  lon: number
  label?: string
}

export interface AdviceRequest {
  /**
   * The plan under discussion, or `null` when the rider is planning from
   * scratch and the advisor is helping build the ride itself.
   */
  context: AdvisorRouteContext | null
  /** Prior turns. Empty on the opening call. */
  conversation: AdvisorMessage[]
  /** The rider's newest message; absent means "give me your opening read". */
  riderMessage?: string
  /** Map centre or rider location, used to bias place search when there is no route. */
  origin?: AdvisorOrigin
}

export interface RouteAdviser {
  advise(input: AdviceRequest, signal?: AbortSignal): Promise<AdvisorReply>
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

/** A place a tool actually resolved. The only places that may become points. */
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

export interface ToolResult {
  /** JSON handed back to the model as the tool result. */
  content: unknown
  /** Places named by this result, addressable by `placeId`. */
  places: GroundedPlace[]
  citations: GroundingCitation[]
}

/** A Gemini function declaration. */
export interface AdvisorToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/**
 * The advisor's own tools: everything it can look up that Switchback controls.
 * Google Maps grounding is *not* here — it is a server-side Gemini tool that
 * runs inside the same call (see gemini-adviser.ts).
 */
export interface AdvisorToolbox {
  definitions(input: AdviceRequest): AdvisorToolDefinition[]
  call(
    name: string,
    args: Record<string, unknown>,
    input: AdviceRequest,
    signal?: AbortSignal
  ): Promise<ToolResult>
}
