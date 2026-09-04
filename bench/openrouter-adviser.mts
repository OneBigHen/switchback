import {
  emptyReply,
  type AdviceRequest,
  type AdvisorReply,
  type AdvisorStatus,
  type AdvisorToolbox,
  type GroundedPlace,
  type RouteAdviser
} from "@/lib/advice/contracts"
import { advisorSystemPrompt } from "@/lib/advice/route-context"
import { FINAL_ANSWER_SCHEMA, resolveFinalAnswer } from "@/lib/advice/resolve-answer"

/**
 * The advisor over an OpenAI-shaped chat-completions API (OpenRouter).
 *
 * Deliberately the same shape as the Gemini adapter and nothing more: same
 * system prompt, same Switchback toolbox, same response schema, same resolvers.
 * Only the transport differs, which is the whole point of the benchmark — and
 * also what makes this promotable to a real provider seam if it wins.
 *
 * Unlike Gemini, this API can combine tools and a JSON schema in one request,
 * so there is no separate structured pass: the model can call tools and then
 * answer in schema within the same loop.
 */

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
/** Matched to the Gemini adapter's own turn deadline so neither arm gets more
 *  wall-clock budget than the other. */
const TURN_TIMEOUT_MS = 30_000
const MAX_TOOL_ROUNDS = 4
const MAX_TOOL_CALLS_PER_ROUND = 4
const MAX_CONVERSATION_TURNS = 14
export const ORIGIN_PLACE_ID = "origin"

export interface OpenRouterAdviserOptions {
  apiKey: string
  model: string
  toolbox: AdvisorToolbox
  fetcher?: typeof fetch
  endpoint?: string
  /** OpenRouter provider routing preferences, e.g. { sort: "throughput" }. */
  provider?: Record<string, unknown>
  reasoningEffort?: "minimal" | "low" | "medium" | "high"
  /**
   * When the response schema is attached.
   *
   * "always" sends tools and the schema together on every round, which this API
   * permits and Gemini's does not. "final" mirrors the Gemini adapter instead:
   * tool rounds carry only tools, and one last schema-only call produces the
   * answer. The two are worth separating because asking for a schema answer and
   * a tool call in the same breath appears to push a model towards narrating
   * the lookup it was about to perform rather than performing it.
   */
  schemaMode?: "always" | "final"
  onUsage?(usage: OpenRouterUsage): void
}

export interface OpenRouterUsage {
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  costUsd: number | null
  providerName: string | null
}

interface ChatToolCall {
  id: string
  type?: string
  function: { name: string; arguments: string }
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content?: string | null
  tool_calls?: ChatToolCall[]
  tool_call_id?: string
  name?: string
}

interface ChatResponse {
  choices?: Array<{ message?: ChatMessage; finish_reason?: string }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    cost?: number
    completion_tokens_details?: { reasoning_tokens?: number }
  }
  provider?: string
  error?: { message?: string; code?: number }
}

/** The Switchback toolbox rendered as OpenAI-style function tools. */
function toolsFor(toolbox: AdvisorToolbox, input: AdviceRequest) {
  return toolbox.definitions(input).map((definition) => ({
    type: "function" as const,
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters
    }
  }))
}

export function createOpenRouterAdviser(options: OpenRouterAdviserOptions): RouteAdviser {
  const fetcher = options.fetcher ?? fetch
  const endpoint = options.endpoint ?? OPENROUTER_ENDPOINT

  return {
    async advise(input: AdviceRequest, signal?: AbortSignal): Promise<AdvisorReply> {
      const deadline = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TURN_TIMEOUT_MS)])
        : AbortSignal.timeout(TURN_TIMEOUT_MS)

      const messages: ChatMessage[] = [
        { role: "system", content: advisorSystemPrompt(input) },
        ...input.conversation.slice(-MAX_CONVERSATION_TURNS).map((turn): ChatMessage => ({
          role: turn.role === "rider" ? "user" : "assistant",
          content: turn.text.slice(0, 2_000)
        })),
        {
          role: "user",
          content: input.riderMessage?.trim().slice(0, 1_000)
            || (input.context
              ? "Give me your read on this route before I commit to it."
              : "Help me put a ride together.")
        }
      ]

      const groundedPlaces = new Map<string, GroundedPlace>()
      if (input.origin) {
        groundedPlaces.set(ORIGIN_PLACE_ID, {
          placeId: ORIGIN_PLACE_ID,
          name: input.origin.label?.trim() || "My selected start",
          kind: "scenic",
          lat: input.origin.lat,
          lon: input.origin.lon,
          citations: []
        })
      }

      const schemaMode = options.schemaMode ?? "always"
      let toolCalls = 0

      const call = async (withTools: boolean, withSchema: boolean): Promise<ChatResponse | AdvisorStatus> => {
        try {
          const response = await fetcher(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${options.apiKey}`,
              "HTTP-Referer": "https://switchback.local",
              "X-Title": "Switchback advisor benchmark"
            },
            body: JSON.stringify({
              model: options.model,
              messages,
              temperature: 0.35,
              ...(withTools
                ? {
                    tools: toolsFor(options.toolbox, input),
                    tool_choice: "auto",
                    parallel_tool_calls: true
                  }
                : {}),
              usage: { include: true },
              ...(options.provider ? { provider: options.provider } : {}),
              ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
              ...(withSchema
                ? {
                    response_format: {
                      type: "json_schema",
                      json_schema: {
                        name: "switchback_advisor_answer",
                        strict: false,
                        schema: FINAL_ANSWER_SCHEMA
                      }
                    }
                  }
                : {})
            }),
            signal: deadline
          })
          if (response.status === 429) return "rate-limited"
          if (!response.ok) return "unavailable"
          const payload = await response.json() as ChatResponse
          if (payload.error) return "unavailable"
          options.onUsage?.({
            promptTokens: payload.usage?.prompt_tokens ?? 0,
            completionTokens: payload.usage?.completion_tokens ?? 0,
            reasoningTokens: payload.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
            costUsd: payload.usage?.cost ?? null,
            providerName: payload.provider ?? null
          })
          return payload
        } catch {
          return deadline.aborted ? "timeout" : "unavailable"
        }
      }

      const failed = (status: AdvisorStatus): AdvisorReply => ({
        ...emptyReply(status),
        usage: { toolCalls, groundedQueries: 0 }
      })

      const finish = (text: string | null | undefined): AdvisorReply | null => {
        const resolved = resolveFinalAnswer(text ?? undefined, {
          candidateIds: input.context?.candidates.map((candidate) => candidate.id) ?? [],
          ...(input.context ? { selectedRouteId: input.context.selectedRouteId } : {}),
          places: groundedPlaces,
          geometry: input.context?.geometry ?? []
        })
        if (!resolved) return null
        return {
          status: "ok",
          ...resolved,
          citations: [...groundedPlaces.values()].flatMap((place) => place.citations).slice(0, 8),
          usage: { toolCalls, groundedQueries: 0 }
        }
      }

      let lastText: string | null = null

      /** One schema-only call with the tools withheld, as the Gemini adapter does. */
      const structuredPass = async (): Promise<AdvisorReply> => {
        messages.push({
          role: "user",
          content: "Now give your answer as JSON matching the required schema. " +
            "Only reference placeIds that a tool actually returned to you."
        })
        const payload = await call(false, true)
        if (typeof payload === "string") return failed(payload)
        return finish(payload.choices?.[0]?.message?.content ?? lastText) ?? failed("malformed")
      }

      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const payload = await call(true, schemaMode === "always")
        if (typeof payload === "string") return failed(payload)
        const message = payload.choices?.[0]?.message
        if (!message) return failed("malformed")
        if (typeof message.content === "string" && message.content.trim()) lastText = message.content

        const requested = message.tool_calls ?? []
        // Same rule as the Gemini path: never partially execute a batch.
        if (requested.length > MAX_TOOL_CALLS_PER_ROUND) return failed("malformed")

        if (requested.length === 0) {
          if (schemaMode === "final") return structuredPass()
          const reply = finish(lastText)
          if (reply) return reply
          return failed("malformed")
        }

        messages.push(message)
        for (const toolCall of requested) {
          toolCalls += 1
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>
          } catch {
            args = {}
          }
          const result = await options.toolbox.call(toolCall.function.name, args, input, deadline)
          for (const place of result.places) groundedPlaces.set(place.placeId, place)
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(result.content)
          })
        }
      }

      // Rounds exhausted: ask once for the schema answer with tools withheld.
      return structuredPass()
    }
  }
}
