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
 * Two phases, because the API requires it:
 *
 * 1. **Grounded tool rounds.** Our function declarations plus Gemini's
 *    server-side `google_maps` tool. Places can be researched, but anything that
 *    becomes a route point still has to be resolved by Switchback.
 * 2. **A strict structured answer.** Maps grounding and a JSON response schema
 *    cannot share the same request, so the final pass drops Maps and asks for
 *    the schema. Resolvers then distrust the result again.
 *
 * Every failure degrades to an `AdvisorReply` with a status. The advisor is
 * optional evidence and is never on the routing critical path.
 */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
/** Cheap, fast, and Maps-grounding capable. */
const DEFAULT_MODEL = "gemini-3.5-flash-lite"
const TURN_TIMEOUT_MS = 30_000
/** Enough to look something up and check what it is like; not enough to wander. */
const MAX_TOOL_ROUNDS = 4
const MAX_TOOL_CALLS_PER_ROUND = 4
const MAX_CONVERSATION_TURNS = 14
/** The rider's explicitly supplied planner start, always pinned and referenceable. */
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
                ...(mapsEnabled ? { include_server_side_tool_invocations: true } : {}),
                ...(mapsEnabled && anchor
                  ? { retrievalConfig: { latLng: { latitude: anchor[1], longitude: anchor[0] } } }
                  : {})
              },
              generationConfig: {
                temperature: 0.35,
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

      const failed = (status: AdvisorStatus): AdvisorReply => ({
        ...emptyReply(status),
        citations: mergeCitations(citationGroups),
        usage: { toolCalls, groundedQueries }
      })

      const finish = (text: string | undefined): AdvisorReply | null => {
        const resolved = resolveFinalAnswer(text, {
          candidateIds: input.context?.candidates.map((candidate) => candidate.id) ?? [],
          ...(input.context ? { selectedRouteId: input.context.selectedRouteId } : {}),
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

        const requested = parts.flatMap((part) => part.functionCall ? [part.functionCall] : [])
        const said = parts.map((part) => part.text ?? "").join("").trim()
        if (said) prose = said

        // Do not partially execute a model turn. Gemini requires the model's
        // function-call turn to be echoed back as a unit; truncating five calls
        // to four and answering only four creates an invalid conversation and
        // can also perform a surprising half-action. Reject the batch instead.
        if (requested.length > MAX_TOOL_CALLS_PER_ROUND) return failed("malformed")

        if (requested.length === 0) {
          if (!mapsOn) {
            const reply = finish(said)
            if (reply) return reply
          }
          break
        }

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

      // A grounded prose fallback is useful only if the grounding pass also
      // produced a source the UI can show. Otherwise we would turn a structured
      // validation failure into an uncited factual answer.
      const hasGroundingSource = mergeCitations(citationGroups).length > 0
      if (prose && (!mapsOn || hasGroundingSource)) {
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
