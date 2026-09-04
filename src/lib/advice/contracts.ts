import type { PlannedRoute, RouteProfileId } from "@/lib/routing/types"

/**
 * The route advisor's typed surface.
 *
 * The advisor is a proposer, never a decider. Model output can describe or fill
 * in bounded planner inputs; resolvers verify every route id and route point
 * before the result reaches a rider-facing action.
 */

export type AdvisorStatus =
  | "ok"
  | "no-key"
  | "disabled"
  | "timeout"
  | "unavailable"
  | "malformed"
  | "rate-limited"

export interface AdvisorMessage {
  role: "rider" | "advisor"
  text: string
}

export interface GroundingCitation {
  title: string
  url: string
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

export interface ProposedStop {
  id: string
  name: string
  reason: string
  kind: ProposedStopKind
  /** Resolved by Switchback-owned place/road data — never model coordinates. */
  anchor: { lat: number; lon: number }
  /** Distance-based position along the chosen route; null without route geometry. */
  routeProgress: number | null
  citations: GroundingCitation[]
}

/** A filled-in planner draft the rider must confirm before routing. */
export interface ProposedRide {
  mode: "destination" | "loop"
  profile: RouteProfileId
  targetMinutes: number | null
  start: ProposedRidePoint
  finish: ProposedRidePoint | null
  waypoints: ProposedRidePoint[]
  avoidHighways: boolean
  tollPolicy: "allow-with-warning" | "avoid"
  summary: string
}

export interface ProposedRidePoint {
  name: string
  lat: number
  lon: number
}

export interface RouteSecondOpinion {
  agreesWithSwitchback: boolean
  /** An id from the candidate set Switchback already produced. */
  wouldPick: string
  rationale: string
  cautions: string[]
  confidence: "low" | "medium" | "high"
}

export interface AdvisorReply {
  status: AdvisorStatus
  message: string
  secondOpinion: RouteSecondOpinion | null
  proposedStops: ProposedStop[]
  proposedRide: ProposedRide | null
  citations: GroundingCitation[]
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

/** The finished deterministic plan the conversation is about. */
export interface AdvisorRouteContext {
  selectedRouteId: string
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
  > & {
    corridorOption?: string
    ascentMeters?: number | null
    descentMeters?: number | null
  }>
  geometry: Array<[longitude: number, latitude: number]>
  warnings: string[]
}

/** An explicit planner start the rider supplied. */
export interface AdvisorOrigin {
  lat: number
  lon: number
  label?: string
}

export interface AdviceRequest {
  /** Null while the rider is building from scratch. */
  context: AdvisorRouteContext | null
  conversation: AdvisorMessage[]
  /** Absent means “give me your opening read” for an existing route. */
  riderMessage?: string
  /** Explicit planner start used to bias pre-route place search. */
  origin?: AdvisorOrigin
}

export interface RouteAdviser {
  advise(input: AdviceRequest, signal?: AbortSignal): Promise<AdvisorReply>
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

export interface GroundedPlace {
  /** Stable within one turn; the model references this id, never coordinates. */
  placeId: string
  name: string
  kind: ProposedStopKind
  lat: number
  lon: number
  detail?: string
  citations: GroundingCitation[]
}

export interface ToolResult {
  content: unknown
  places: GroundedPlace[]
  citations: GroundingCitation[]
}

export interface AdvisorToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** Switchback-owned function tools. Built-in Maps grounding lives in the transport. */
export interface AdvisorToolbox {
  definitions(input: AdviceRequest): AdvisorToolDefinition[]
  call(
    name: string,
    args: Record<string, unknown>,
    input: AdviceRequest,
    signal?: AbortSignal
  ): Promise<ToolResult>
}
