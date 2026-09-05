import {
  emptyReply,
  type AdviceRequest,
  type AdvisorReply,
  type AdvisorStatus,
  type AdvisorToolbox,
  type AdvisorToolDefinition,
  type GroundedPlace,
  type GroundingCitation
} from "./contracts"
import { resolveFinalAnswer } from "./resolve-answer"
import type { AdvisorExecutionMode } from "./execution-policy"

/**
 * The seam between the deterministic advisor core and one model transport.
 *
 * A provider owns exactly one thing: how to talk to its API. It does not own
 * the system prompt, the toolbox, the response schema, candidate validation,
 * place-coordinate resolution, or the planner handoff — those are shared and
 * must stay shared, because they are where the product's boundaries are
 * enforced. A provider that reimplemented any of them could quietly weaken a
 * guarantee the other provider still keeps.
 */

/** The rider's explicitly supplied planner start, always pinned and referenceable. */
export const ORIGIN_PLACE_ID = "origin"

export interface AdvisorProviderInput {
  request: AdviceRequest
  mode: AdvisorExecutionMode
  /**
   * Exactly the declarations this turn may expose. **Empty for route-only**,
   * and a provider must send what it is given rather than asking the toolbox
   * itself — that is what makes a route-only turn structurally unable to enter
   * a tool round.
   */
  tools: readonly AdvisorToolDefinition[]
  toolbox: AdvisorToolbox
  systemPrompt: string
  /** Maps grounding permitted for this turn. Never true for route-only. */
  mapsGrounding: boolean
}

export interface AdvisorProviderResult {
  reply: AdvisorReply
  /** Which model actually produced this, for internal usage metadata. */
  modelId: string
}

export interface AdvisorProvider {
  id: string
  runTurn(input: AdvisorProviderInput, signal?: AbortSignal): Promise<AdvisorProviderResult>
}

/**
 * Operational failures are the only ones worth trying another provider for.
 *
 * A timeout, a 429, a 5xx or a dropped connection say nothing about the
 * question — the same question may well succeed elsewhere. `malformed` is
 * different: it means a model answered and the deterministic resolvers refused
 * the answer. Retrying that through provider after provider until one produces
 * something acceptable is shopping for a verdict, and it would turn the
 * resolvers from a boundary into an obstacle.
 */
export function isRetryableFailure(status: AdvisorStatus): boolean {
  return status === "timeout" || status === "unavailable" || status === "rate-limited"
}

/**
 * The per-turn state every transport needs and neither should own.
 *
 * Seeding the pinned origin, accumulating grounded places as tools return
 * them, merging citations and running the final resolver are identical for any
 * API shape. Keeping them here is what stops "the OpenRouter one" and "the
 * Gemini one" from drifting apart on the rules that matter.
 */
export function createTurnState(request: AdviceRequest) {
  const places = new Map<string, GroundedPlace>()
  if (request.origin) {
    places.set(ORIGIN_PLACE_ID, {
      placeId: ORIGIN_PLACE_ID,
      name: request.origin.label?.trim() || "My selected start",
      kind: "scenic",
      lat: request.origin.lat,
      lon: request.origin.lon,
      citations: []
    })
  }

  const citationGroups: GroundingCitation[][] = []
  let toolCalls = 0
  let groundedQueries = 0

  return {
    places,
    get toolCalls() { return toolCalls },
    get groundedQueries() { return groundedQueries },
    countToolCall(): void { toolCalls += 1 },
    countGroundedQuery(): void { groundedQueries += 1 },
    addCitations(citations: readonly GroundingCitation[]): void {
      if (citations.length > 0) citationGroups.push([...citations])
    },
    /** Record everything one tool result contributes to the turn. */
    absorb(result: { places: readonly GroundedPlace[]; citations: readonly GroundingCitation[] }): void {
      for (const place of result.places) places.set(place.placeId, place)
      if (result.citations.length > 0) citationGroups.push([...result.citations])
    },
    citations(extra: readonly GroundingCitation[][] = []): GroundingCitation[] {
      return mergeCitations([...extra, ...citationGroups])
    },
    failed(status: AdvisorStatus): AdvisorReply {
      return {
        ...emptyReply(status),
        citations: mergeCitations(citationGroups),
        usage: { toolCalls, groundedQueries }
      }
    },
    /** Validate a model's structured answer, or null if it does not survive. */
    resolve(text: string | null | undefined): AdvisorReply | null {
      const resolved = resolveFinalAnswer(text ?? undefined, {
        candidateIds: request.context?.candidates.map((candidate) => candidate.id) ?? [],
        ...(request.context ? { selectedRouteId: request.context.selectedRouteId } : {}),
        places,
        geometry: request.context?.geometry ?? []
      })
      if (!resolved) return null
      return {
        status: "ok",
        ...resolved,
        citations: mergeCitations([
          ...resolved.proposedStops.map((stop) => stop.citations),
          ...citationGroups
        ]),
        usage: { toolCalls, groundedQueries }
      }
    }
  }
}

export type AdvisorTurnState = ReturnType<typeof createTurnState>

export function mergeCitations(groups: readonly GroundingCitation[][]): GroundingCitation[] {
  const merged: GroundingCitation[] = []
  for (const group of groups) {
    for (const citation of group) {
      if (merged.some((existing) => existing.url === citation.url)) continue
      merged.push(citation)
      if (merged.length >= 8) return merged
    }
  }
  return merged
}
