import type { NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import type { CandidateSet, Coordinate, PlannedRoute, RouteRequest } from "./types"
import type { CorridorSourceCandidates } from "./destination-corridors"

export interface TripPlanRequest extends RouteRequest {
  compare?: boolean
  /**
   * Required for `candidateSet: "alternatives"`: the primary route id plus
   * its geometry sampled to at most 128 coordinates. The alternatives
   * endpoint is stateless — it must work after a server cache miss.
   */
  primaryRoute?: { id: string; geometry: Coordinate[] }
}

export type AlternativesOutcomeStatus = "complete" | "partial" | "timed-out" | "none-distinct" | "unavailable"

export interface AlternativesOutcome {
  status: AlternativesOutcomeStatus
  strategy: "engine-alternates" | "lane-search"
}

export interface AlternativesLaneDiagnostic {
  id: string
  status: "fulfilled" | "rejected" | "timed-out" | "cancelled"
  elapsedMs: number
  reason?: string
}

export interface TripPlan {
  /** Echoed from the request so the client can merge only matching lifecycles. */
  requestId?: string
  planningId?: string
  candidateSet?: CandidateSet
  selectedRouteId: string
  routes: PlannedRoute[]
  warnings: string[]
  /** Destination time target echoed from the request. */
  targetMinutes?: number
  /** Server-side phase timings in milliseconds when measured. */
  timingMs?: Record<string, number>
  /** Present on alternatives responses; optional for legacy primary responses. */
  alternativesOutcome?: AlternativesOutcome
  /** Internal lane evidence for server diagnostics; never used as rider copy. */
  diagnostics?: { lanes: AlternativesLaneDiagnostic[] }
}

export interface RoutingResult {
  engine: "graphhopper" | "valhalla" | "hybrid"
  engineVersion: string
  routes: PlannedRoute[]
  warnings?: string[]
}

/** Lifecycle-scoped planning options threaded from the API boundary. */
export interface PlanningOptions {
  /** Cancellation signal; aborts provider fetches without a user-visible error. */
  signal?: AbortSignal
  /**
   * Phase 4: resolves corridor sources (curvature database, known-good GPX,
   * research hints) for destination timeboxing. Injected by the API wiring
   * so the planner stays pure; absent sources degrade to an empty set.
   */
  resolveCorridors?: (request: RouteRequest) => Promise<CorridorSourceCandidates>
}

export type RouteProvider = (
  request: NormalizedRouteRequest,
  options?: PlanningOptions
) => Promise<RoutingResult>

export interface RouteCandidateEnrichmentResult {
  routes: PlannedRoute[]
  warnings: string[]
}

export interface CandidateEnrichmentOptions {
  /** The lane/packet signal; cancellation must not be converted to a warning. */
  signal?: AbortSignal
}

export type RouteCandidateEnricher = (
  request: RouteRequest,
  routes: PlannedRoute[],
  options?: CandidateEnrichmentOptions
) => Promise<RouteCandidateEnrichmentResult>
