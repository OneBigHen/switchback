import {
  emptyReply,
  type AdviceRequest,
  type AdvisorReply,
  type AdvisorStatus,
  type AdvisorToolbox,
  type GroundedPlace,
  type GroundingCitation,
  type ProposedRide,
  type ProposedStop,
  type RouteAdviser,
  type RouteSecondOpinion
} from "./contracts"
import { advisorSystemPrompt, briefingText } from "./route-context"
import { routeProgressOf } from "./toolbox"
import { FINAL_ANSWER_SCHEMA, resolveFinalAnswer } from "./resolve-answer"

/**
 * The advisor, on Gemini directly.
 *
 * Two phases, because the API requires it — verified against the live endpoint:
 *
 * 1. **Grounded tool rounds.** Our function declarations *plus* Gemini's
 *    server-side `google_maps` tool, enabled together with
 *    `toolConfig.include_server_side_tool_invocations`. The model looks places
 *    up, asks Maps what they are actually like, and pins them to coordinates
 *    through Switchback's geocoder.
 * 2. **A strict structured answer.** `google_maps` cannot be combined with a
 *    JSON response mime type — the API rejects it outright — so the final turn
 *    drops the built-in tool and asks for `responseJsonSchema`. Grounding
 *    citations gathered in phase 1 are carried across.
 *
 * Every failure degrades to an `AdvisorReply` with a status, never an
 * exception. The advisor is optional evidence and is never on the routing
 * critical path.
 */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
/** Cheap, fast, and Maps-grounding capable. */
const DEFAULT_MODEL = "gemini-3.5-flash-lite"
const TURN_TIMEOUT_MS = 30_000
/** Enough to look something up and check what it is like; not enough to wander. */
const MAX_TOOL_ROUNDS = 4
const MAX_TOOL_CALLS_PER_ROUND = 4
const MAX_CONVERSATION_TURNS = 14
/** The rider's own location, always pinned and always referenceable. */
export const ORIGIN_PLACE_ID = "origin"

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

/**
 * Maps grounding names places and describes them richly but returns no
 * coordinates, so a chunk is *context*, never a point. The model must still
 * pin anything it wants to use through `lookup_place`, which resolves through
 * Switchback's own geocoder.
 */
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

export function createGeminiAdviser(options: GeminiAdviserOptions): RouteAdviser {
  const fetcher = options.fetcher ?? fetch
  const endpoint = options.endpoint ?? GEMINI_ENDPOINT
  const model = options.model ?? DEFAULT_MODEL

  return {
    async advise(input: AdviceRequest, signal?: AbortSignal): Promise<AdvisorReply> {
      const deadline = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TURN_TIMEOUT_MS)])
        : AbortSignal.timeout(TURN_TIMEOUT_MS)

      const declarations = options.toolbox.definitions(input)
      const contents: GeminiContent[] = [
        ...input.conversation.slice(-MAX_CONVERSATION_TURNS).map((turn): GeminiContent => ({
          role: turn.role === "rider" ? "user" : "model",
          parts: [{ text: turn.text.slice(0, 2_000) }]
        })),
        {
          role: "user",
          parts: [{
            text: input.riderMessage?.trim().slice(0, 1_000)
              || (input.context
                ? "Give me your read on this route before I commit to it."
                : "Help me put a ride together.")
          }]
        }
      ]

      const groundedPlaces = new Map<string, GroundedPlace>()
      // The rider's own position is a place too. Without this the model has to
      // invent a start, and a "loop from Harrisburg" comes back starting at
      // whichever brewery it looked up first.
      if (input.origin) {
        groundedPlaces.set(ORIGIN_PLACE_ID, {
          placeId: ORIGIN_PLACE_ID,
          name: input.origin.label?.trim() || "Where I am now",
          kind: "scenic",
          lat: input.origin.lat,
          lon: input.origin.lon,
          citations: []
        })
      }
      const citationGroups: GroundingCitation[][] = []
      let toolCalls = 0
      let groundedQueries = 0

      const call = async (grounded: boolean): Promise<GeminiResponse | AdvisorStatus> => {
        const mapsEnabled = grounded && options.mapsGrounding === true
        const tools: Record<string, unknown>[] = []
        if (declarations.length > 0) {
          tools.push({
            functionDeclarations: declarations.map((definition) => ({
              name: definition.name,
              description: definition.description,
              parameters: definition.parameters
            }))
          })
        }
        if (mapsEnabled) tools.push({ google_maps: {} })

        const anchor = input.context?.geometry[Math.floor(input.context.geometry.length / 2)]
          ?? (input.origin ? [input.origin.lon, input.origin.lat] as const : null)

        try {
          const response = await fetcher(`${endpoint}/${model}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
            body: JSON.stringify({
              contents,
              systemInstruction: { parts: [{ text: advisorSystemPrompt(input) }] },
              ...(tools.length > 0 ? { tools } : {}),
              toolConfig: {
                // Built-in tools and function calling only coexist with this on.
                ...(mapsEnabled ? { include_server_side_tool_invocations: true } : {}),
                ...(mapsEnabled && anchor
                  ? { retrievalConfig: { latLng: { latitude: anchor[1], longitude: anchor[0] } } }
                  : {})
              },
              generationConfig: {
                temperature: 0.35,
                // Maps grounding and a JSON mime type are mutually exclusive —
                // the API rejects the pair outright — so the schema rides along
                // on every call that is not carrying the Maps tool. Our own
                // function declarations combine with it fine, so a turn that
                // needs no grounding costs exactly one call.
                ...(mapsEnabled
                  ? {}
                  : {
                      responseMimeType: "application/json",
                      responseJsonSchema: FINAL_ANSWER_SCHEMA
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

      // A turn that ends badly still cost tool calls and may already have
      // gathered sources; reporting zero would hide both from the budget.
      const failed = (status: AdvisorStatus): AdvisorReply => ({
        ...emptyReply(status),
        citations: mergeCitations(citationGroups),
        usage: { toolCalls, groundedQueries }
      })

      const finish = (text: string | undefined): AdvisorReply | null => {
        const resolved = resolveFinalAnswer(text, {
          candidateIds: input.context?.candidates.map((candidate) => candidate.id) ?? [],
          places: groundedPlaces,
          geometry: input.context?.geometry ?? []
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

      const mapsOn = options.mapsGrounding === true
      let prose = ""

      // Phase 1: grounded tool rounds. The model leaves the loop by answering.
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const payload = await call(true)
        if (typeof payload === "string") return failed(payload)
        const candidate = payload.candidates?.[0]
        const parts = candidate?.content?.parts ?? []
        const chunks = candidate?.groundingMetadata?.groundingChunks ?? []
        if (chunks.length > 0) {
          groundedQueries += 1
          const citations = citationsFrom(chunks)
          if (citations.length > 0) citationGroups.push(citations)
        }

        const requested = parts
          .flatMap((part) => part.functionCall ? [part.functionCall] : [])
          .slice(0, MAX_TOOL_CALLS_PER_ROUND)
        const said = parts.map((part) => part.text ?? "").join("").trim()
        if (said) prose = said
        if (requested.length === 0) {
          // Without the Maps tool this call already carried the answer schema,
          // so the model's reply is the final answer and needs no second call.
          if (!mapsOn) {
            const reply = finish(said)
            if (reply) return reply
          }
          break
        }

        // Gemini requires the model turn to be echoed back verbatim, including
        // thought signatures, before the function responses.
        contents.push({ role: "model", parts })
        const responses: GeminiPart[] = []
        for (const functionCall of requested) {
          const name = functionCall.name ?? ""
          toolCalls += 1
          const result = await options.toolbox.call(
            name,
            functionCall.args ?? {},
            input,
            deadline
          )
          for (const place of result.places) groundedPlaces.set(place.placeId, place)
          if (result.citations.length > 0) citationGroups.push(result.citations)
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

      // Phase 2: the strict structured answer, without the built-in tool.
      contents.push({
        role: "user",
        parts: [{
          text: "Now give your answer as JSON matching the required schema. " +
            "Only reference placeIds that a tool actually returned to you."
        }]
      })
      const payload = await call(false)
      if (typeof payload === "string") return failed(payload)
      const text = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
      const structured = finish(text)
      if (structured) return structured
      // The structured pass failed, but the advisor did say something useful in
      // the grounded phase. Showing its actual words beats showing an error;
      // only the structured extras are lost.
      if (prose) {
        return {
          ...failed("ok"),
          message: prose.slice(0, 900)
        }
      }
      return failed("malformed")
    }
  }
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

export type { ProposedRide, ProposedStop, RouteSecondOpinion }
export { routeProgressOf, briefingText }
