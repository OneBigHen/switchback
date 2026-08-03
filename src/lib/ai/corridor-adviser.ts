import { string, enum_, nullable, object_, array, safeParse, type Infer } from "@/lib/validate"
import type { RideCharacter } from "./ride-intent"
import type { Waypoint } from "@/lib/routing/types"

/**
 * Phase 5: You.com corridor adviser.
 *
 * Asks the You.com Research API for named, source-backed motorcycle corridor
 * suggestions inside a strict output schema, then validates every hint:
 * source URLs must parse, anchors must geocode, duplicates collapse, and
 * ungeocodable/hallucinated names are discarded. The adviser emits hints
 * ONLY — Phase 4 owns every geographic-envelope and GraphHopper routability
 * check, and no AI-produced geometry is ever trusted.
 *
 * The adviser is never on the primary critical path: the caller supplies an
 * abort signal and a deadline, and every failure degrades to an empty result
 * with a diagnostic status.
 */

export type CorridorAdviserStatus = "ok" | "no-key" | "timeout" | "unavailable" | "malformed" | "empty"

export interface CorridorHint {
  id: string
  name: string
  /** Geocodable anchor: town, junction, or road endpoint. */
  anchorQuery: string
  /** Resolved anchor coordinates (from the injected geocoder). */
  anchor: { lat: number; lon: number }
  tollRisk: "none" | "possible" | "likely"
  rationale: string
  sourceUrls: string[]
}

export interface CorridorAdviserResult {
  hints: CorridorHint[]
  status: CorridorAdviserStatus
}

export interface CorridorAdviserInput {
  start: Waypoint
  finish: Waypoint
  targetMinutes: number
  character: RideCharacter
}

export interface CorridorAdviserOptions {
  apiKey?: string
  fetcher?: typeof fetch
  /** Caller cancellation; a timeout is layered on top. */
  signal?: AbortSignal
  /** Injected geocoder used to prove an anchor is real. */
  geocode?: (query: string) => Promise<Array<{ lat: number; lon: number; label?: string }>>
  researchUrl?: string
  timeoutMs?: number
}

const RESEARCH_URL = "https://api.you.com/v1/research"
const ADVISER_TIMEOUT_MS = 10_000

const hintSchema = object_({
  name: string({ trim: true, min: 2, max: 160 }),
  anchor: string({ trim: true, min: 2, max: 160 }),
  crossings: nullable(string({ trim: true, min: 2, max: 160 })),
  tollRisk: enum_(["none", "possible", "likely"] as const),
  rationale: string({ trim: true, min: 4, max: 500 }),
  sourceUrls: array(string({ trim: true, min: 8, max: 300 }), { min: 1, max: 6 })
})

const corridorResearchSchema = object_({
  corridors: array(hintSchema, { min: 0, max: 3 })
})

type RawHint = Infer<typeof hintSchema>

function validHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "https:" || parsed.protocol === "http:"
  } catch {
    return false
  }
}

function normalizeHint(raw: RawHint, sources: string[]): Omit<CorridorHint, "id" | "anchor"> | null {
  const sourceUrls = [...new Set(raw.sourceUrls.filter(validHttpUrl).concat(sources.filter(validHttpUrl)))]
    .slice(0, 6)
  if (sourceUrls.length === 0) return null
  return {
    name: raw.name.slice(0, 160),
    anchorQuery: raw.anchor.slice(0, 160),
    tollRisk: raw.tollRisk,
    rationale: raw.rationale.slice(0, 500),
    sourceUrls
  }
}

function researchPrompt(input: CorridorAdviserInput): string {
  const duration = `${Math.round(input.targetMinutes)} minutes`
  return [
    `Recommend up to three named, paved motorcycle roads or corridor routes between ${input.start.label ?? "the start"} and ${input.finish.label ?? "the finish"}, for about ${duration} of ${input.character} riding in Pennsylvania/New Jersey.`,
    "For each corridor: a real road or route name, a geocodable anchor town or junction, a realistic toll risk (none/possible/likely), a one-sentence rationale, and 1-3 real source URLs you actually read.",
    "Never invent roads, towns, coordinates, or sources. Do not recommend generic interstates. If you cannot find real named corridors, return an empty corridors array."
  ].join(" ")
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    corridors: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          anchor: { type: "string" },
          crossings: { type: ["string", "null"] },
          tollRisk: { type: "string", enum: ["none", "possible", "likely"] },
          rationale: { type: "string" },
          sourceUrls: { type: "array", items: { type: "string" } }
        },
        required: ["name", "anchor", "tollRisk", "rationale", "sourceUrls"]
      }
    }
  },
  required: ["corridors"]
} as const

interface ResearchPayload {
  output?: { content?: unknown }
  sources?: Array<{ url?: string; title?: string }>
  error?: { message?: string }
}

/**
 * Validate, geocode, and de-duplicate raw corridor suggestions. Hints whose
 * anchor cannot be geocoded are discarded as hallucinated; hints without any
 * valid source URL are discarded; nearby anchors collapse into one hint.
 */
export async function validateCorridorHints(
  raw: RawHint[],
  sourceUrls: string[],
  geocode: CorridorAdviserOptions["geocode"]
): Promise<CorridorHint[]> {
  if (!geocode) return []
  const hints: CorridorHint[] = []
  for (const candidate of raw) {
    const normalized = normalizeHint(candidate, sourceUrls)
    if (!normalized) continue
    const places = await geocode(normalized.anchorQuery)
    const place = places[0]
    if (!place) continue
    const duplicate = hints.some((hint) =>
      Math.abs(hint.anchor.lat - place.lat) < 0.05 && Math.abs(hint.anchor.lon - place.lon) < 0.05
    )
    if (duplicate) continue
    hints.push({
      id: `hint-${hints.length + 1}`,
      ...normalized,
      anchor: { lat: place.lat, lon: place.lon }
    })
    if (hints.length >= 3) break
  }
  return hints
}

export async function adviseCorridors(
  input: CorridorAdviserInput,
  options: CorridorAdviserOptions = {}
): Promise<CorridorAdviserResult> {
  if (!options.apiKey?.trim()) return { hints: [], status: "no-key" }
  const fetcher = options.fetcher ?? fetch
  const url = options.researchUrl ?? RESEARCH_URL
  const timeoutMs = options.timeoutMs ?? ADVISER_TIMEOUT_MS

  let response: Response
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": options.apiKey
      },
      body: JSON.stringify({
        input: researchPrompt(input),
        research_effort: "standard",
        output_schema: OUTPUT_SCHEMA
      }),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs)
    })
  } catch (caught) {
    const aborted = caught !== null && typeof caught === "object"
      && (caught as { name?: unknown }).name === "AbortError"
    return { hints: [], status: aborted ? "timeout" : "unavailable" }
  }

  if (!response.ok) return { hints: [], status: "unavailable" }

  let payload: ResearchPayload
  try {
    payload = await response.json() as ResearchPayload
  } catch {
    return { hints: [], status: "malformed" }
  }

  const parsed = safeParse(corridorResearchSchema, payload.output?.content)
  if (!parsed.success) return { hints: [], status: "malformed" }

  const sourceUrls = (payload.sources ?? [])
    .map((source) => source.url ?? "")
    .filter(validHttpUrl)

  const hints = await validateCorridorHints(parsed.data.corridors, sourceUrls, options.geocode)
  return { hints, status: hints.length > 0 ? "ok" : "empty" }
}
