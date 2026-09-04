import {
  emptyReply,
  type AdviceRequest,
  type AdvisorReply,
  type AdvisorStatus,
  type GroundedPlace,
  type GroundingCitation,
  type GroundingSource,
  type ProposedStop,
  type ProposedStopKind,
  type RouteAdviser,
  type RouteSecondOpinion
} from "./contracts"
import { ADVISOR_SYSTEM_PROMPT, briefingText } from "./route-context"
import { routeProgressOf } from "./local-grounding"

/**
 * The one adviser implementation: a cheap model on OpenRouter, given tools.
 *
 * It is a bounded agentic loop, not a framework — at most `MAX_TOOL_ROUNDS`
 * rounds of tool calls, one shared deadline, and a strict JSON final answer.
 * Every failure degrades to an `AdvisorReply` with a status, never an
 * exception: the advisor is optional evidence and must never break planning.
 *
 * The safety boundary lives here rather than in the prompt:
 *
 * - `wouldPick` is checked against the candidate ids Switchback supplied. An id
 *   the model invented drops the whole second opinion.
 * - A proposed stop must reference a `placeId` that a grounding tool actually
 *   returned in *this* turn. Coordinates come from that tool result. A place the
 *   model imagined cannot be resolved, so it cannot become a waypoint.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite"
const TURN_TIMEOUT_MS = 20_000
/** Enough for "look up stops, then look up one more"; not enough to wander. */
const MAX_TOOL_ROUNDS = 3
const MAX_TOOL_CALLS_PER_ROUND = 3
const MAX_PROPOSED_STOPS = 3
const MAX_CONVERSATION_TURNS = 12

export interface OpenRouterAdviserOptions {
  apiKey: string
  model?: string
  fetcher?: typeof fetch
  /** Grounding sources, in the order their tools are offered. */
  grounding: GroundingSource[]
  endpoint?: string
}

interface ChatToolCall {
  id: string
  type?: string
  function?: { name?: string; arguments?: string }
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: ChatToolCall[]
  tool_call_id?: string
}

interface ChatPayload {
  choices?: Array<{ message?: ChatMessage; finish_reason?: string }>
}

const FINAL_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message", "secondOpinion", "proposedStopIds"],
  properties: {
    message: {
      type: "string",
      minLength: 1,
      maxLength: 900,
      description: "What you would tell the rider, in their language, two or three sentences."
    },
    secondOpinion: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["agreesWithSwitchback", "wouldPick", "rationale", "cautions", "confidence"],
      properties: {
        agreesWithSwitchback: { type: "boolean" },
        wouldPick: {
          type: "string",
          description: "A route id from the briefing. Never a new route."
        },
        rationale: { type: "string", minLength: 1, maxLength: 400 },
        cautions: { type: "array", maxItems: 3, items: { type: "string", maxLength: 200 } },
        confidence: { type: "string", enum: ["low", "medium", "high"] }
      }
    },
    proposedStopIds: {
      type: "array",
      maxItems: MAX_PROPOSED_STOPS,
      description: "placeIds a tool returned to you, plus why each belongs on this ride.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["placeId", "reason"],
        properties: {
          placeId: { type: "string", maxLength: 200 },
          reason: { type: "string", minLength: 1, maxLength: 200 }
        }
      }
    }
  }
} as const

interface FinalAnswer {
  message?: unknown
  secondOpinion?: unknown
  proposedStopIds?: unknown
}

function textOf(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, max) : null
}

/**
 * Accept a second opinion only when it points at a route Switchback actually
 * produced. This is the "no LLM route ranker" boundary in code: the advisor
 * can disagree, but only about routes that already exist.
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
 * Turn the model's `placeId` references into stops. A reference that no tool
 * produced is dropped: the model never supplies coordinates, so it cannot
 * invent a waypoint.
 */
export function resolveProposedStops(
  raw: unknown,
  places: ReadonlyMap<string, GroundedPlace>,
  geometry: readonly [number, number][]
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

function mergeCitations(groups: readonly GroundingCitation[][]): GroundingCitation[] {
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

export function createOpenRouterAdviser(options: OpenRouterAdviserOptions): RouteAdviser {
  const fetcher = options.fetcher ?? fetch
  const endpoint = options.endpoint ?? OPENROUTER_URL
  const model = options.model ?? DEFAULT_MODEL

  return {
    async advise(input: AdviceRequest, signal?: AbortSignal): Promise<AdvisorReply> {
      const candidateIds = input.context.candidates.map((candidate) => candidate.id)
      if (candidateIds.length === 0) return emptyReply("unavailable")

      const deadline = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TURN_TIMEOUT_MS)])
        : AbortSignal.timeout(TURN_TIMEOUT_MS)

      const toolOwners = new Map<string, GroundingSource>()
      const tools = options.grounding.flatMap((source) =>
        source.tools(input.context).map((definition) => {
          toolOwners.set(definition.name, source)
          return {
            type: "function" as const,
            function: {
              name: definition.name,
              description: definition.description,
              parameters: definition.parameters
            }
          }
        })
      )

      const messages: ChatMessage[] = [
        { role: "system", content: ADVISOR_SYSTEM_PROMPT },
        { role: "user", content: briefingText(input.context) },
        ...input.conversation.slice(-MAX_CONVERSATION_TURNS).map((turn): ChatMessage => ({
          role: turn.role === "rider" ? "user" : "assistant",
          content: turn.text.slice(0, 2_000)
        })),
        {
          role: "user",
          content: input.riderMessage?.trim().slice(0, 1_000)
            || "Give me your read on this route before I commit to it."
        }
      ]

      const groundedPlaces = new Map<string, GroundedPlace>()
      const citationGroups: GroundingCitation[][] = []
      let toolCalls = 0
      let groundedQueries = 0

      // Tools and the strict answer schema travel together, so a turn that
      // needs no tool costs exactly one completion. The model either calls a
      // tool or hands back the final JSON.
      const call = async (withTools: boolean): Promise<ChatPayload | AdvisorStatus> => {
        try {
          const response = await fetcher(endpoint, {
            method: "POST",
            headers: {
              authorization: `Bearer ${options.apiKey}`,
              "content-type": "application/json",
              "x-title": "Switchback"
            },
            body: JSON.stringify({
              model,
              temperature: 0.3,
              messages,
              ...(withTools && tools.length > 0 ? { tools } : {}),
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "route_advice",
                  strict: true,
                  schema: FINAL_ANSWER_SCHEMA
                }
              }
            }),
            signal: deadline
          })
          if (!response.ok) return "unavailable"
          return await response.json() as ChatPayload
        } catch {
          return deadline.aborted ? "timeout" : "unavailable"
        }
      }

      const finalize = (content: string | null | undefined): AdvisorReply | null => {
        if (!content) return null
        let answer: FinalAnswer
        try {
          answer = JSON.parse(content) as FinalAnswer
        } catch {
          return null
        }
        const message = textOf(answer.message, 900)
        if (!message) return null
        const proposedStops = resolveProposedStops(
          answer.proposedStopIds,
          groundedPlaces,
          input.context.geometry
        )
        return {
          status: "ok",
          message,
          secondOpinion: resolveSecondOpinion(answer.secondOpinion, candidateIds),
          proposedStops,
          citations: mergeCitations([
            ...proposedStops.map((stop) => stop.citations),
            ...citationGroups
          ]),
          usage: { toolCalls, groundedQueries }
        }
      }

      // Tool rounds: the model gathers facts, we run the tools, it sees results.
      // It leaves the loop by answering instead of calling another tool.
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
        const canUseTools = tools.length > 0 && round < MAX_TOOL_ROUNDS
        const payload = await call(canUseTools)
        if (typeof payload === "string") return emptyReply(payload)
        const message = payload.choices?.[0]?.message
        const requested = (message?.tool_calls ?? []).slice(0, MAX_TOOL_CALLS_PER_ROUND)
        if (requested.length === 0) {
          const reply = finalize(message?.content)
          if (reply) return reply
          break
        }

        messages.push({
          role: "assistant",
          content: message?.content ?? null,
          tool_calls: requested
        })
        for (const toolCall of requested) {
          const name = toolCall.function?.name ?? ""
          const owner = toolOwners.get(name)
          toolCalls += 1
          if (owner?.id === "google-maps") groundedQueries += 1
          let args: Record<string, unknown> = {}
          try {
            const parsed = JSON.parse(toolCall.function?.arguments ?? "{}") as unknown
            if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>
          } catch {
            // Malformed arguments are the model's problem to recover from; it
            // sees the error as the tool result and can retry or give up.
          }
          const result = owner
            ? await owner.call(name, args, input.context, deadline)
            : { content: { error: `Unknown tool ${name}.` }, places: [], citations: [] }
          for (const place of result.places) groundedPlaces.set(place.placeId, place)
          if (result.citations.length > 0) citationGroups.push(result.citations)
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result.content).slice(0, 4_000)
          })
        }
      }

      // The model never produced a usable answer: one last tool-free attempt
      // before giving up, so a provider that dislikes tools plus a response
      // schema still yields something.
      const payload = await call(false)
      if (typeof payload === "string") return emptyReply(payload)
      return finalize(payload.choices?.[0]?.message?.content) ?? emptyReply("malformed")
    }
  }
}

export type { ProposedStopKind }
