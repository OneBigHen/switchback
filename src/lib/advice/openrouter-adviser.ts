import {
  type AdviceRequest,
  type AdvisorProviderUsageSink,
  type AdvisorReply,
  type AdvisorStatus,
  type AdvisorToolbox,
  type AdvisorToolDefinition
} from "./contracts"
import { FINAL_ANSWER_SCHEMA, ROUTE_ONLY_ANSWER_SCHEMA } from "./resolve-answer"
import {
  createTurnState,
  type AdvisorProvider,
  type AdvisorProviderInput,
  type AdvisorProviderResult
} from "./provider"

/**
 * The advisor over an OpenAI-shaped chat-completions API (OpenRouter).
 *
 * Deliberately the same shape as the Gemini adapter and nothing more: same
 * system prompt, same Switchback toolbox, same response schema, same resolvers,
 * same turn deadline. Only the transport differs.
 *
 * This API *can* carry tools and a JSON schema in one request, which Gemini's
 * cannot — and the bake-off showed that letting it do so on a tool-needing
 * question is actively harmful: the model tends to narrate the lookup it was
 * about to perform rather than performing it, producing a schema-valid answer
 * with zero tool calls and an empty proposal. Seven of twelve tasks came back
 * that way. So tool-assisted turns here run the *same* two-phase shape Gemini
 * uses, and the combined form is reserved for `route-only`, where there are no
 * tools to skip and the single request is the entire point.
 */

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
/** Matched to the Gemini adapter so neither provider gets more wall clock. */
const TURN_TIMEOUT_MS = 30_000
const MAX_TOOL_ROUNDS = 4
const MAX_TOOL_CALLS_PER_ROUND = 4
const MAX_CONVERSATION_TURNS = 14

/**
 * The canonical alias carries a leading tilde; the bare id is rejected with
 * `400 "not a valid model ID"`.
 */
export const DEFAULT_OPENROUTER_MODEL = "~deepseek/deepseek-v4-flash-latest"

export interface OpenRouterAdviserOptions {
  apiKey: string
  model?: string
  fetcher?: typeof fetch
  endpoint?: string
  /**
   * OpenRouter provider routing preferences. `require_parameters` is not
   * optional in practice: without it a downstream provider that ignores
   * `response_format` can be selected, and the turn comes back unparseable
   * through no fault of the model.
   */
  provider?: Record<string, unknown>
  reasoningEffort?: "minimal" | "low" | "medium" | "high"
  /**
   * Reasoning effort for `route-only` turns, which is where it actually pays.
   *
   * A route-only turn is one round trip, so round trips are no longer the
   * bottleneck — the model's own reasoning is. Measured on the same question:
   * 8685ms at default effort against 3059ms at minimal, which is the difference
   * between "the rider waits" and "the rider reads". On tool-assisted turns the
   * same setting bought nothing (17.8s vs 17.1s) because round trips dominate
   * there, so it is deliberately scoped to this mode.
   */
  routeOnlyReasoningEffort?: "minimal" | "low" | "medium" | "high"
  onUsage?: AdvisorProviderUsageSink
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
function asChatTools(definitions: readonly AdvisorToolDefinition[]) {
  return definitions.map((definition) => ({
    type: "function" as const,
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters
    }
  }))
}

function openingMessage(request: AdviceRequest): string {
  return request.riderMessage?.trim().slice(0, 1_000)
    || (request.context
      ? "Give me your read on this route before I commit to it."
      : "Help me put a ride together.")
}

export function createOpenRouterProvider(options: OpenRouterAdviserOptions): AdvisorProvider {
  const fetcher = options.fetcher ?? fetch
  const endpoint = options.endpoint ?? OPENROUTER_ENDPOINT
  const model = options.model ?? DEFAULT_OPENROUTER_MODEL

  return {
    id: "openrouter",
    async runTurn(input: AdvisorProviderInput, signal?: AbortSignal): Promise<AdvisorProviderResult> {
      const request = input.request
      const deadline = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TURN_TIMEOUT_MS)])
        : AbortSignal.timeout(TURN_TIMEOUT_MS)

      const state = createTurnState(request)
      const done = (reply: AdvisorReply): AdvisorProviderResult => ({ reply, modelId: model })

      const messages: ChatMessage[] = [
        { role: "system", content: input.systemPrompt },
        ...request.conversation.slice(-MAX_CONVERSATION_TURNS).map((turn): ChatMessage => ({
          role: turn.role === "rider" ? "user" : "assistant",
          content: turn.text.slice(0, 2_000)
        })),
        { role: "user", content: openingMessage(request) }
      ]

      // Route-only is a single request answered from the briefing: cap the
      // thinking, because there is no lookup for it to plan.
      const effort = input.mode === "route-only"
        ? options.routeOnlyReasoningEffort ?? "minimal"
        : options.reasoningEffort

      // A turn with no tools cannot pin a place, so it is not offered the
      // fields that would require one.
      const answerSchema = input.mode === "route-only"
        ? ROUTE_ONLY_ANSWER_SCHEMA
        : FINAL_ANSWER_SCHEMA

      const call = async (withTools: boolean, withSchema: boolean): Promise<ChatResponse | AdvisorStatus> => {
        try {
          const response = await fetcher(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${options.apiKey}`,
              "HTTP-Referer": "https://switchback.app",
              "X-Title": "Switchback route advisor"
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.35,
              ...(withTools && input.tools.length > 0
                ? {
                    tools: asChatTools(input.tools),
                    tool_choice: "auto",
                    parallel_tool_calls: true
                  }
                : {}),
              usage: { include: true },
              provider: { require_parameters: true, ...options.provider },
              ...(effort ? { reasoning: { effort } } : {}),
              ...(withSchema
                ? {
                    response_format: {
                      type: "json_schema",
                      json_schema: {
                        name: "switchback_advisor_answer",
                        strict: false,
                        schema: answerSchema
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
            upstreamProvider: payload.provider ?? null
          })
          return payload
        } catch {
          return deadline.aborted ? "timeout" : "unavailable"
        }
      }

      const contentOf = (payload: ChatResponse): string | null =>
        payload.choices?.[0]?.message?.content ?? null

      // ---- route-only: exactly one request, no declarations, schema attached.
      if (input.mode === "route-only") {
        const payload = await call(false, true)
        if (typeof payload === "string") return done(state.failed(payload))
        return done(state.resolve(contentOf(payload)) ?? state.failed("malformed"))
      }

      let lastText: string | null = null

      /** One schema-only call with the tools withheld, as the Gemini adapter does. */
      const structuredPass = async (): Promise<AdvisorProviderResult> => {
        messages.push({
          role: "user",
          content: "Now give your answer as JSON matching the required schema. " +
            "Only reference placeIds that a tool actually returned to you."
        })
        const payload = await call(false, true)
        if (typeof payload === "string") return done(state.failed(payload))
        return done(state.resolve(contentOf(payload) ?? lastText) ?? state.failed("malformed"))
      }

      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const payload = await call(true, false)
        if (typeof payload === "string") return done(state.failed(payload))
        const message = payload.choices?.[0]?.message
        if (!message) return done(state.failed("malformed"))
        if (typeof message.content === "string" && message.content.trim()) lastText = message.content

        const requested = message.tool_calls ?? []
        // Same rule as the Gemini path: never partially execute a batch.
        if (requested.length > MAX_TOOL_CALLS_PER_ROUND) return done(state.failed("malformed"))
        if (requested.length === 0) return structuredPass()

        messages.push(message)
        for (const toolCall of requested) {
          state.countToolCall()
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>
          } catch {
            args = {}
          }
          const result = await input.toolbox.call(toolCall.function.name, args, request, deadline)
          state.absorb(result)
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

export type { AdvisorToolbox }
