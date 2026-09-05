import {
  type AdviceRequest,
  type AdvisorReply,
  type AdvisorStatus,
  type AdvisorToolbox,
  type GroundingCitation,
  type ProposedRide,
  type ProposedStop,
  type RouteAdviser,
  type RouteSecondOpinion
} from "./contracts"
import { advisorSystemPrompt, briefingText } from "./route-context"
import { routeProgressOf } from "./toolbox"
import { FINAL_ANSWER_SCHEMA, ROUTE_ONLY_ANSWER_SCHEMA } from "./resolve-answer"
import { classifyTurn, mapsAllowedForMode, toolsForMode } from "./execution-policy"
import {
  createTurnState,
  ORIGIN_PLACE_ID,
  type AdvisorProvider,
  type AdvisorProviderInput,
  type AdvisorProviderResult
} from "./provider"

/**
 * The advisor, on Gemini directly.
 *
 * Two phases when the turn needs tools, because the API requires it:
 *
 * 1. **Grounded tool rounds.** Our function declarations plus Gemini's
 *    server-side `google_maps` tool. Places can be researched, but anything that
 *    becomes a route point still has to be resolved by Switchback.
 * 2. **A strict structured answer.** Maps grounding and a JSON response schema
 *    cannot share the same request, so the final pass drops Maps and asks for
 *    the schema. Resolvers then distrust the result again.
 *
 * A `route-only` turn skips all of that: no declarations are sent, so no tool
 * call can come back, and the schema rides on the single request. That is the
 * whole latency win — one round trip instead of two at minimum.
 *
 * Every failure degrades to an `AdvisorReply` with a status. The advisor is
 * optional evidence and is never on the routing critical path.
 */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
/**
 * Cheap, fast, Maps-grounding capable — and, unlike the obvious newer choice,
 * actually answering.
 *
 * `gemini-3.5-flash-lite` was the original default and is measurably not
 * usable behind a 30-second turn: 2 successes in 60 advisor turns, the rest
 * timeouts and 503s carrying Google's "currently experiencing high demand"
 * body, with zero rate limiting to explain it. Evidence and method in
 * `docs/design/2026-09-04-advisor-provider-bakeoff.md`; override with
 * `GEMINI_ADVISOR_MODEL` once it recovers.
 */
const DEFAULT_MODEL = "gemini-3.1-flash-lite"

/**
 * The co-pilot is a second opinion on a plan the rider is already looking at,
 * so a turn that thinks for half a minute has already lost. Constraining the
 * thinking budget took the same model from 8% to 42% of turns answered inside
 * the deadline, and the answers it did return were no worse.
 */
const THINKING_LEVEL = "low"
const TURN_TIMEOUT_MS = 30_000
/** Enough to look something up and check what it is like; not enough to wander. */
const MAX_TOOL_ROUNDS = 4
const MAX_TOOL_CALLS_PER_ROUND = 4
const MAX_CONVERSATION_TURNS = 14

export { ORIGIN_PLACE_ID }

export interface GeminiAdviserOptions {
  apiKey: string
  model?: string
  fetcher?: typeof fetch
  toolbox: AdvisorToolbox
  /** Google Maps grounding: place character and freshness, server-side. */
  mapsGrounding?: boolean
  endpoint?: string
}

interface GeminiFunctionCall {
  id?: string
  name?: string
  args?: Record<string, unknown>
}

interface GeminiPart {
  text?: string
  functionCall?: GeminiFunctionCall
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> }
  thoughtSignature?: string
}

interface GeminiContent {
  role?: string
  parts?: GeminiPart[]
}

interface GeminiGroundingChunk {
  maps?: { title?: string; uri?: string; text?: string }
  web?: { title?: string; uri?: string }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: GeminiContent
    finishReason?: string
    groundingMetadata?: { groundingChunks?: GeminiGroundingChunk[] }
  }>
  error?: { status?: string; message?: string }
}

/** Maps may describe a place, but its chunk is context rather than a waypoint. */
function citationsFrom(chunks: readonly GeminiGroundingChunk[]): GroundingCitation[] {
  const citations: GroundingCitation[] = []
  for (const chunk of chunks) {
    const place = chunk.maps ?? chunk.web
    const title = place?.title?.trim()
    const url = place?.uri?.trim()
    if (!title || !url) continue
    try {
      if (new URL(url).protocol !== "https:") continue
    } catch {
      continue
    }
    if (citations.some((existing) => existing.url === url)) continue
    citations.push({ title, url, source: chunk.maps ? "google-maps" : "switchback-local" })
  }
  return citations.slice(0, 8)
}

function openingMessage(request: AdviceRequest): string {
  return request.riderMessage?.trim().slice(0, 1_000)
    || (request.context
      ? "Give me your read on this route before I commit to it."
      : "Help me put a ride together.")
}

export function createGeminiProvider(options: GeminiAdviserOptions): AdvisorProvider {
  const fetcher = options.fetcher ?? fetch
  const endpoint = options.endpoint ?? GEMINI_ENDPOINT
  const model = options.model ?? DEFAULT_MODEL

  return {
    id: "gemini",
    async runTurn(input: AdvisorProviderInput, signal?: AbortSignal): Promise<AdvisorProviderResult> {
      const request = input.request
      const deadline = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TURN_TIMEOUT_MS)])
        : AbortSignal.timeout(TURN_TIMEOUT_MS)

      const state = createTurnState(request)
      const done = (reply: AdvisorReply): AdvisorProviderResult => ({ reply, modelId: model })

      const contents: GeminiContent[] = [
        ...request.conversation.slice(-MAX_CONVERSATION_TURNS).map((turn): GeminiContent => ({
          role: turn.role === "rider" ? "user" : "model",
          parts: [{ text: turn.text.slice(0, 2_000) }]
        })),
        { role: "user", parts: [{ text: openingMessage(request) }] }
      ]

      // A turn with no tools cannot pin a place, so it is not offered the
      // fields that would require one.
      const answerSchema = input.mode === "route-only"
        ? ROUTE_ONLY_ANSWER_SCHEMA
        : FINAL_ANSWER_SCHEMA

      /**
       * `withTools` is passed explicitly rather than inferred, so a route-only
       * turn cannot acquire declarations by accident anywhere in this file.
       */
      const call = async (withTools: boolean, withMaps: boolean): Promise<GeminiResponse | AdvisorStatus> => {
        const tools: Record<string, unknown>[] = []
        if (withTools && input.tools.length > 0) {
          tools.push({
            functionDeclarations: input.tools.map((definition) => ({
              name: definition.name,
              description: definition.description,
              parameters: definition.parameters
            }))
          })
        }
        if (withMaps) tools.push({ google_maps: {} })

        const anchor = request.context?.geometry[Math.floor(request.context.geometry.length / 2)]
          ?? (request.origin ? [request.origin.lon, request.origin.lat] as const : null)

        try {
          const response = await fetcher(`${endpoint}/${model}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
            body: JSON.stringify({
              contents,
              systemInstruction: { parts: [{ text: input.systemPrompt }] },
              ...(tools.length > 0 ? { tools } : {}),
              toolConfig: {
                ...(withMaps ? { include_server_side_tool_invocations: true } : {}),
                ...(withMaps && anchor
                  ? { retrievalConfig: { latLng: { latitude: anchor[1], longitude: anchor[0] } } }
                  : {})
              },
              generationConfig: {
                temperature: 0.35,
                thinkingConfig: { thinkingLevel: THINKING_LEVEL },
                ...(withMaps
                  ? {}
                  : {
                      responseMimeType: "application/json",
                      responseJsonSchema: answerSchema
                    })
              }
            }),
            signal: deadline
          })
          if (response.status === 429) return "rate-limited"
          if (!response.ok) return "unavailable"
          const payload = await response.json() as GeminiResponse
          return payload.error ? "unavailable" : payload
        } catch {
          return deadline.aborted ? "timeout" : "unavailable"
        }
      }

      const textOf = (payload: GeminiResponse): string =>
        (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("")

      // ---- route-only: exactly one request, no declarations, schema attached.
      if (input.mode === "route-only") {
        const payload = await call(false, false)
        if (typeof payload === "string") return done(state.failed(payload))
        return done(state.resolve(textOf(payload)) ?? state.failed("malformed"))
      }

      const mapsOn = input.mapsGrounding
      let prose = ""

      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const payload = await call(true, mapsOn)
        if (typeof payload === "string") return done(state.failed(payload))
        const candidate = payload.candidates?.[0]
        const parts = candidate?.content?.parts ?? []
        const chunks = candidate?.groundingMetadata?.groundingChunks ?? []
        if (chunks.length > 0) {
          state.countGroundedQuery()
          state.addCitations(citationsFrom(chunks))
        }

        const requested = parts.flatMap((part) => part.functionCall ? [part.functionCall] : [])
        const said = parts.map((part) => part.text ?? "").join("").trim()
        if (said) prose = said

        // Do not partially execute a model turn. Gemini requires the model's
        // function-call turn to be echoed back as a unit; truncating five calls
        // to four and answering only four creates an invalid conversation and
        // can also perform a surprising half-action. Reject the batch instead.
        if (requested.length > MAX_TOOL_CALLS_PER_ROUND) return done(state.failed("malformed"))

        if (requested.length === 0) {
          if (!mapsOn) {
            const reply = state.resolve(said)
            if (reply) return done(reply)
          }
          break
        }

        contents.push({ role: "model", parts })
        const responses: GeminiPart[] = []
        for (const functionCall of requested) {
          const name = functionCall.name ?? ""
          state.countToolCall()
          const result = await input.toolbox.call(name, functionCall.args ?? {}, request, deadline)
          state.absorb(result)
          responses.push({
            functionResponse: {
              ...(functionCall.id ? { id: functionCall.id } : {}),
              name,
              response: { result: result.content }
            }
          })
        }
        contents.push({ role: "user", parts: responses })
      }

      contents.push({
        role: "user",
        parts: [{
          text: "Now give your answer as JSON matching the required schema. " +
            "Only reference placeIds that a tool actually returned to you."
        }]
      })
      const payload = await call(false, false)
      if (typeof payload === "string") return done(state.failed(payload))
      const structured = state.resolve(textOf(payload))
      if (structured) return done(structured)

      // A grounded prose fallback is useful only if the grounding pass also
      // produced a source the UI can show. Otherwise we would turn a structured
      // validation failure into an uncited factual answer.
      const hasGroundingSource = state.citations().length > 0
      if (prose && (!mapsOn || hasGroundingSource)) {
        return done({ ...state.failed("ok"), message: prose.slice(0, 900) })
      }
      return done(state.failed("malformed"))
    }
  }
}

/**
 * The single-provider adviser.
 *
 * Retained because it is the smallest thing that satisfies `RouteAdviser` for
 * callers and tests that only care about Gemini. It classifies the turn the
 * same way the router does, so a direct Gemini deployment still gets the
 * one-request route-only path.
 */
export function createGeminiAdviser(options: GeminiAdviserOptions): RouteAdviser {
  const provider = createGeminiProvider(options)
  return {
    async advise(input: AdviceRequest, signal?: AbortSignal): Promise<AdvisorReply> {
      const mode = classifyTurn(input)
      const result = await provider.runTurn({
        request: input,
        mode,
        tools: toolsForMode(mode, options.toolbox, input),
        toolbox: options.toolbox,
        systemPrompt: advisorSystemPrompt(input, mode),
        mapsGrounding: mapsAllowedForMode(mode, options.mapsGrounding === true)
      }, signal)
      return result.reply
    }
  }
}

export type { ProposedRide, ProposedStop, RouteSecondOpinion }
export { routeProgressOf, briefingText }
