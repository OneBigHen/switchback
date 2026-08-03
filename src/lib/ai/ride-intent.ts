import type { RouteProfileId, TollPolicy } from "@/lib/routing/types"
import { string, number, boolean, nullable, enum_, object_, safeParse, type Infer } from "@/lib/validate"

export type RideCharacter = "fun" | "quick" | "twisty" | "scenic" | "adventure" | "balanced"

export interface RideIntent {
  mode: "loop" | "destination"
  profile: RouteProfileId
  /** The rider's own character words before resolution into a routing
   *  profile. Unqualified "fun" means maximum twisties on paved roads. */
  rideCharacter: RideCharacter
  targetMinutes: number | null
  /** Default allows tolls with a visible warning; explicit avoid-toll
   *  language maps to `avoid`. Never silently hide toll exposure. */
  tollPolicy: TollPolicy
  /** True when the local parser had to guess the core of the request
   *  (no riding-style language, or destination-vs-loop without a keyword). */
  ambiguous: boolean
  startQuery: string | null
  destinationQuery: string | null
  stopQuery: "brewery" | "coffee" | "food" | null
  preferGravel: boolean
  avoidHighways: boolean
  summary: string
  source: "local" | "openrouter"
}

export interface RideIntentInterpreterOptions {
  apiKey?: string
  model?: string
  fetcher?: typeof fetch
}

const rideIntentSchema = object_({
  mode: enum_(["loop", "destination"] as const),
  profile: enum_(["quick", "twisty", "scenic", "adventure"] as const),
  rideCharacter: enum_(["fun", "quick", "twisty", "scenic", "adventure", "balanced"] as const),
  targetMinutes: nullable(number({ int: true, min: 20, max: 480 })),
  tollPolicy: enum_(["allow-with-warning", "avoid"] as const),
  ambiguous: boolean(),
  startQuery: nullable(string({ trim: true, min: 2, max: 160 })),
  destinationQuery: nullable(string({ trim: true, min: 2, max: 160 })),
  stopQuery: nullable(enum_(["brewery", "coffee", "food"] as const)),
  preferGravel: boolean(),
  avoidHighways: boolean(),
  summary: string({ trim: true, min: 2, max: 240 })
})

type RideIntentData = Infer<typeof rideIntentSchema>

function validateIntent(data: RideIntentData): RideIntentData {
  if (data.mode === "destination" && !data.destinationQuery) {
    throw new Error("Destination mode requires a destination")
  }
  return data
}

const NUMBER_WORDS: Record<string, number> = {
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6
}

function targetMinutes(prompt: string): number | null {
  const minutes = prompt.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i)
  if (minutes) return Math.max(20, Math.min(480, Number(minutes[1])))
  const hours = prompt.match(/\b(\d+(?:\.\d+)?|half|one|two|three|four|five|six)\s*(?:hours?|hrs?)\b/i)
  if (!hours) return null
  const value = NUMBER_WORDS[hours[1].toLowerCase()] ?? Number(hours[1])
  return Math.max(20, Math.min(480, Math.round(value * 60)))
}

function cleanPlaceQuery(value: string | undefined): string | null {
  if (!value) return null
  const cleaned = value
    .replace(
      /\s+(?:(?:on|via|using)\s+|with\s+|for\s+|while\s+|avoiding\s+|without\s+|and\s+(?:avoid|skip|stay)\b)[\s\S]*$/i,
      ""
    )
    .replace(
      /,\s*(?=(?:quick|fastest|direct|shortest|twisty|curvy|scenic|adventure|avoid|skip|without|using|via)\b)[\s\S]*$/i,
      ""
    )
    .replace(
      /\s+(?:near\s+me|(?:fastest|quickest|quick|shortest|direct|scenic|twisty|curvy|adventure)(?:\s+route)?)\s*$/i,
      ""
    )
    .replace(/[.?!;]+$/, "")
    .trim()
  return cleaned.length >= 2 && cleaned.length <= 160 ? cleaned : null
}

function destinationQuery(prompt: string): string | null {
  const explicit = prompt.match(
    /\b(?:(?:take|route|navigate|guide|direct|get|bring)(?:\s+me)?|ride|go|head|drive|travel)\s+to\s+([\s\S]+)$/i
  ) ?? prompt.match(/\b(?:directions?|destination(?:\s+is)?)\s*(?:to|:)\s*([\s\S]+)$/i)
    ?? prompt.match(/^\s*where\s+(?:is|are)\s+([\s\S]+)$/i)
  if (explicit) return cleanPlaceQuery(explicit[1])

  const styledDestination = prompt.match(
    /\b(?:scenic|backroads?|twisty|curvy|winding|adventure|gravel|quick|fastest)\b[\s\S]*?\bto\s+([\s\S]+)$/i
  )
  if (styledDestination) return cleanPlaceQuery(styledDestination[1])

  if (/(?:\bfrom|\bstarting\s+(?:in|near)|\bstart(?:ing)?\s+at)\b/i.test(prompt)) {
    return cleanPlaceQuery(prompt.match(/\bto\s+([\s\S]+)$/i)?.[1])
  }
  return null
}

function conciseDestinationQuery(prompt: string, duration: number | null): string | null {
  const candidate = prompt.trim().replace(/[.?!]+$/, "")
  if (candidate.length < 2 || candidate.length > 160 || duration !== null) return null
  if (/\b(?:loop|round[ -]?trip|home|twisty|curvy|curves?|scenic|gravel|dirt|unpaved|highways?|interstates?|coffee|cafe|brewery|lunch|dinner|ride somewhere|surprise me)\b/i.test(candidate)) return null
  if (/;|\b(?:then|via|with|avoid|without)\b/i.test(candidate)) return null
  return cleanPlaceQuery(candidate)
}

function startQuery(prompt: string): string | null {
  const match = prompt.match(
    /\b(?:from|starting\s+(?:in|near)|start(?:ing)?\s+at)\s+(.+?)(?=\s+to\s+|\s+(?:for|with|via|on|using|and|then|avoid(?:ing)?)\b|[.;]|$)/i
  )
  const query = cleanPlaceQuery(match?.[1])
  return query && /^(?:here|my\s+(?:current\s+)?location|current\s+location|where\s+i\s+am(?:\s+now)?)$/i.test(query)
    ? null
    : query
}

export function parseRidePromptLocally(prompt: string): RideIntent {
  const normalized = prompt.trim().toLowerCase()
  const duration = targetMinutes(prompt)
  const preferGravel = /\b(?:gravel|dirt|unpaved|forest roads?|fire roads?|dual[ -]?sport)\b/.test(normalized)
  const adventureWord = /\b(?:adventure|adventurous)\b/.test(normalized)
  const twisty = /\b(?:twisty|curvy|curves?|switchbacks?|winding)\b/.test(normalized)
  const quick = /\b(?:quick|fastest|direct|shortest)\b/.test(normalized)
  const scenic = /\b(?:scenic|backroads?|rural|country roads?)\b/.test(normalized)
  const fun = /\bfun\b/.test(normalized)
  const rideCharacter: RideCharacter = quick
    ? "quick"
    : scenic
      ? "scenic"
      : preferGravel || adventureWord
        ? "adventure"
        : twisty
          ? "twisty"
          : fun
            ? "fun"
            : "balanced"
  const avoidTolls = /\b(?:(?:avoid(?:ing)?|no|skip|without|stay\s+off)\s+(?:the\s+)?(?:tolls?|toll\s+roads?|tollways?|turnpikes?)|toll[ -]?free)\b/i.test(normalized)
  const tollPolicy: TollPolicy = avoidTolls ? "avoid" : "allow-with-warning"
  const unresolvedSavedHome = /^(?:home|(?:take|navigate|route|guide|get|bring)\s+me\s+home)[.!?]*$/i.test(prompt.trim())
  const destination = unresolvedSavedHome
    ? "Home"
    : destinationQuery(prompt) ?? conciseDestinationQuery(prompt, duration)
  const origin = startQuery(prompt)
  const loop = (!unresolvedSavedHome && /\b(?:loop|round[ -]?trip|bring me home|back home|return home)\b/.test(normalized)) ||
    (destination === null && !unresolvedSavedHome)
  const avoidHighways = /\b(?:(?:avoid(?:ing)?|no|skip)\s+(?:the\s+)?|stay\s+off\s+(?:the\s+)?|without\s+(?:the\s+)?)(?:highways?|interstates?|motorways?|freeways?|expressways?)\b/.test(normalized)
  const stopQuery = /\b(?:brewery|beer|brewpub)\b/.test(normalized)
    ? "brewery"
    : /\b(?:coffee|cafe|café)\b/.test(normalized)
      ? "coffee"
      : /\b(?:food|lunch|dinner|restaurant|meal)\b/.test(normalized)
        ? "food"
        : null
  const hasStyleKeyword = /(?:quick|fastest|direct|shortest|scenic|backroads?|rural|country roads?|twisty|curvy|curves?|switchbacks?|winding|gravel|dirt|unpaved|adventure|fun)\b/.test(normalized)
  const hasLoopKeyword = /\b(?:loop|round[ -]?trip|bring me home|back home|return home)\b/.test(normalized)
  const ambiguous = !hasStyleKeyword || (destination === null && !hasLoopKeyword && !unresolvedSavedHome)
  const profile: RouteProfileId = preferGravel || adventureWord
    ? "adventure"
    : twisty
      ? "twisty"
      : quick
        ? "quick"
        : scenic
          ? "scenic"
          : fun
            ? "twisty"
            : "scenic"

  return {
    mode: loop ? "loop" : "destination",
    profile,
    rideCharacter,
    targetMinutes: duration,
    tollPolicy,
    ambiguous,
    startQuery: origin,
    destinationQuery: loop ? null : destination,
    stopQuery,
    preferGravel,
    avoidHighways,
    summary: [
      duration ? `${duration}-minute` : null,
      rideCharacter === "fun" ? "fun" : profile,
      loop ? "loop" : destination ? `ride to ${destination}` : "ride",
      avoidHighways ? "avoiding highways" : null,
      tollPolicy === "avoid" ? "avoiding tolls" : null
    ].filter(Boolean).join(" "),
    source: "local"
  }
}

interface OpenRouterPayload {
  choices?: Array<{ message?: { content?: string } }>
}

export async function interpretRidePrompt(
  prompt: string,
  options: RideIntentInterpreterOptions = {}
): Promise<RideIntent> {
  const fallback = parseRidePromptLocally(prompt)
  if (!options.apiKey) return fallback

  try {
    const response = await (options.fetcher ?? fetch)(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
          "x-title": "Switchback"
        },
        body: JSON.stringify({
          model: options.model ?? "openrouter/free",
          temperature: 0.15,
          messages: [
            {
              role: "system",
              content: "Translate a rider's request into route-planning intent. Prefer adventure for gravel, twisty for curves, scenic for rural touring, and quick only when speed is explicit. Unqualified 'fun' means maximum twisties on paved roads and must set rideCharacter to 'fun'. A duration without a destination means a loop. 'Avoid tolls', 'no tolls', or 'toll-free' sets tollPolicy to 'avoid'; otherwise use 'allow-with-warning'. Set ambiguous when the request lacks an explicit riding style or a clear destination/loop signal. Extract a fuzzy starting place when supplied, but do not invent an origin or destination."
            },
            { role: "user", content: prompt }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "ride_intent",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: [
                  "mode",
                  "profile",
                  "rideCharacter",
                  "targetMinutes",
                  "tollPolicy",
                  "ambiguous",
                  "startQuery",
                  "destinationQuery",
                  "stopQuery",
                  "preferGravel",
                  "avoidHighways",
                  "summary"
                ],
                properties: {
                  mode: { type: "string", enum: ["loop", "destination"] },
                  profile: { type: "string", enum: ["quick", "twisty", "scenic", "adventure"] },
                  rideCharacter: { type: "string", enum: ["fun", "quick", "twisty", "scenic", "adventure", "balanced"] },
                  targetMinutes: { type: ["integer", "null"], minimum: 20, maximum: 480 },
                  tollPolicy: { type: "string", enum: ["allow-with-warning", "avoid"] },
                  ambiguous: { type: "boolean" },
                  startQuery: { type: ["string", "null"], maxLength: 160 },
                  destinationQuery: { type: ["string", "null"], maxLength: 160 },
                  stopQuery: { type: ["string", "null"], enum: ["brewery", "coffee", "food", null] },
                  preferGravel: { type: "boolean" },
                  avoidHighways: { type: "boolean" },
                  summary: { type: "string", minLength: 2, maxLength: 240 }
                }
              }
            }
          }
        }),
        signal: AbortSignal.timeout(12_000)
      }
    )
    if (!response.ok) return fallback
    const payload = await response.json() as OpenRouterPayload
    const content = payload.choices?.[0]?.message?.content
    if (!content) return fallback
    const parsed = safeParse(rideIntentSchema, JSON.parse(content))
    if (!parsed.success) return fallback
    try {
      const validated = validateIntent(parsed.data)
      return { ...validated, source: "openrouter" as const }
    } catch {
      return fallback
    }
  } catch {
    return fallback
  }
}
