import type {
  AdvisorRouteContext,
  AdvisorToolDefinition,
  GroundedPlace,
  GroundingCitation,
  GroundingResult,
  GroundingSource,
  ProposedStopKind
} from "./contracts"

/**
 * Optional premium grounding: Grounding with Google Maps.
 *
 * Why this is a separate transport, not just another tool
 * ------------------------------------------------------
 * `google_maps` is a Gemini-API-*native* tool. OpenRouter's OpenAI-compatible
 * surface does not carry it, so the advisor cannot simply add it to the tool
 * list of its OpenRouter call. This source therefore makes its own request to
 * `generativelanguage.googleapis.com` with `tools: [{ google_maps: {} }]` and
 * hands the grounded answer back to the conversation as a tool result. That is
 * why the interface is `GroundingSource` (a fact provider) rather than a second
 * `RouteAdviser`: the co-pilot stays one voice, on one cheap model.
 *
 * What it is used for, and what it is deliberately NOT used for
 * -------------------------------------------------------------
 * Used: place character, on-route points of interest, and freshness the
 * key-free OSM source cannot supply. Google Maps grounding can also return
 * directions and travel times; Switchback does not consume those. Route
 * geometry, route choice, and every score stay entirely with GraphHopper /
 * Valhalla and the deterministic pipeline (ADR 0001, ADR 0017). Maps content is
 * shown, attributed, and discarded — never stored, never folded into the route
 * Atlas, and never used to derive a routing decision.
 *
 * That boundary is not only an architecture preference: Google Maps Platform
 * terms restrict extracting or exporting Maps content for use outside the
 * Services, and require the source name and link to be displayed immediately
 * beside the content they support. See ADR 0023's "Owner decisions required" —
 * enabling this source is the owner's call, and it is OFF by default.
 */

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models"
/** Grounded Maps calls are billed per query; keep the deadline tight. */
const GROUNDING_TIMEOUT_MS = 9_000
const MAX_PLACES_PER_CALL = 6

/** Required attribution. Do not localize or restyle the product name. */
export const GOOGLE_MAPS_ATTRIBUTION = "Grounded with Google Maps"

export interface GoogleMapsGroundingOptions {
  apiKey: string
  /** Cheap grounded model; Maps grounding is supported on 2.5 Flash and later. */
  model?: string
  fetcher?: typeof fetch
  endpoint?: string
}

interface GeminiPart {
  text?: string
}

interface GeminiGroundingChunk {
  maps?: {
    title?: string
    uri?: string
    text?: string
    placeId?: string
    placeAnswerSources?: unknown
  }
  web?: { title?: string; uri?: string }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    groundingMetadata?: {
      groundingChunks?: GeminiGroundingChunk[]
      googleMapsWidgetContextToken?: string
    }
  }>
}

function citationsFrom(chunks: readonly GeminiGroundingChunk[]): GroundingCitation[] {
  const citations: GroundingCitation[] = []
  for (const chunk of chunks) {
    const place = chunk.maps ?? chunk.web
    const title = place?.title?.trim()
    const url = place?.uri?.trim()
    if (!title || !url) continue
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "https:") continue
    } catch {
      continue
    }
    if (citations.some((existing) => existing.url === url)) continue
    citations.push({ title, url, source: "google-maps" })
  }
  return citations.slice(0, 8)
}

/**
 * Google's grounding metadata names places but does not hand back coordinates
 * in a shape Switchback may turn into a waypoint. Rather than guess, this
 * source returns *named context only*: it can tell the rider what is on the
 * route and why, and the stop itself must still be resolved through a source
 * that gives Switchback real coordinates. A named place with no anchor is
 * context, not a proposal — which keeps a hallucinated or unresolvable place
 * from ever becoming a routed waypoint.
 */
function placesFrom(): GroundedPlace[] {
  return []
}

function promptFor(
  question: string,
  kind: ProposedStopKind | null,
  context: AdvisorRouteContext
): string {
  const start = context.geometry[0]
  const finish = context.geometry.at(-1)
  const waypoints = context.geometry
    .filter((_, index) => index % 8 === 0)
    .slice(0, 6)
    .map(([lon, lat]) => `${lat.toFixed(4)},${lon.toFixed(4)}`)
    .join(" -> ")
  return [
    "A motorcyclist is riding this route and wants current, specific local knowledge.",
    start && finish
      ? `The ride runs ${start[1].toFixed(4)},${start[0].toFixed(4)} to ${finish[1].toFixed(4)},${finish[0].toFixed(4)} via ${waypoints}.`
      : "",
    kind ? `They are interested in: ${kind}.` : "",
    `Question: ${question}`,
    "Answer in at most four sentences. Name specific places. Do not give directions or route instructions."
  ].filter(Boolean).join("\n")
}

export function createGoogleMapsGrounding(options: GoogleMapsGroundingOptions): GroundingSource {
  const fetcher = options.fetcher ?? fetch
  const model = options.model ?? "gemini-2.5-flash"
  const endpoint = options.endpoint ?? GEMINI_ENDPOINT

  return {
    id: "google-maps",
    attribution: GOOGLE_MAPS_ATTRIBUTION,

    tools(): AdvisorToolDefinition[] {
      return [{
        name: "ask_local_knowledge",
        description:
          "Ask about places and current local character along the rider's route — what a " +
          "spot is actually like, whether it is worth the detour, what is nearby. Returns " +
          "prose plus sources that MUST be shown to the rider. It does not return " +
          "coordinates, so its answers are context: use find_stops_along_route when you " +
          "want to propose an actual stop.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["question"],
          properties: {
            question: {
              type: "string",
              maxLength: 300,
              description: "A single specific question about places on or near this route."
            },
            kind: {
              type: "string",
              enum: ["brewery", "coffee", "food", "fuel", "scenic", "road"],
              description: "Optional category the rider cares about."
            }
          }
        }
      }]
    },

    async call(
      name: string,
      args: Record<string, unknown>,
      context: AdvisorRouteContext,
      signal?: AbortSignal
    ): Promise<GroundingResult> {
      if (name !== "ask_local_knowledge") {
        return { content: { error: `Unknown tool ${name}.` }, places: [], citations: [] }
      }
      const question = typeof args.question === "string" ? args.question.trim().slice(0, 300) : ""
      if (!question) {
        return { content: { error: "Ask a specific question." }, places: [], citations: [] }
      }
      const kind = typeof args.kind === "string" ? args.kind as ProposedStopKind : null
      const center = context.geometry[Math.floor(context.geometry.length / 2)]

      const deadline = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(GROUNDING_TIMEOUT_MS)])
        : AbortSignal.timeout(GROUNDING_TIMEOUT_MS)

      try {
        const response = await fetcher(`${endpoint}/${model}:generateContent`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": options.apiKey
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: promptFor(question, kind, context) }] }],
            tools: [{ google_maps: {} }],
            ...(center
              ? {
                  toolConfig: {
                    retrievalConfig: { latLng: { latitude: center[1], longitude: center[0] } }
                  }
                }
              : {})
          }),
          signal: deadline
        })
        if (!response.ok) {
          return {
            content: { error: "Local knowledge was unavailable; do not state place facts." },
            places: [],
            citations: []
          }
        }
        const payload = await response.json() as GeminiResponse
        const candidate = payload.candidates?.[0]
        const text = (candidate?.content?.parts ?? [])
          .map((part) => part.text ?? "")
          .join(" ")
          .trim()
        const citations = citationsFrom(candidate?.groundingMetadata?.groundingChunks ?? [])
        if (!text || citations.length === 0) {
          // Ungrounded prose from a grounding source is worth less than nothing:
          // it reads as authoritative and cites nobody.
          return {
            content: { error: "No grounded answer came back; say you could not check." },
            places: [],
            citations: []
          }
        }
        return {
          content: {
            answer: text,
            sources: citations.map((citation) => citation.title),
            note: "These sources must be shown to the rider with this claim."
          },
          places: placesFrom().slice(0, MAX_PLACES_PER_CALL),
          citations
        }
      } catch {
        return {
          content: { error: "Local knowledge was unavailable; do not state place facts." },
          places: [],
          citations: []
        }
      }
    }
  }
}
