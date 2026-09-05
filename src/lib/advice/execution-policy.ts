import type { AdviceRequest, AdvisorToolbox, AdvisorToolDefinition } from "./contracts"

/**
 * Which shape of turn this question needs — decided in code, before any model
 * is asked anything.
 *
 * The bake-off showed the co-pilot's latency is dominated by round trips, not
 * by the model: the same model answers a route question in one request and a
 * stop search in four. Most rider questions ("worth the extra 25 minutes?",
 * "which one would you take?", "how much gravel is this?") are already fully
 * answerable from the route facts Switchback computed and put in the briefing,
 * so exposing tools for them buys nothing and costs a round trip the rider
 * waits through.
 *
 * The classifier is deterministic and conservative on purpose:
 *
 * - It never asks a model to decide whether a model call needs tools. That
 *   would reintroduce exactly the round trip it exists to remove.
 * - When in doubt it returns `tool-assisted`. A route-only turn that should
 *   have had tools cannot look anything up and answers worse; a tool-assisted
 *   turn that did not need them is merely a little slower. The failure modes
 *   are not symmetric, so the tie goes to capability.
 */

export type AdvisorExecutionMode = "route-only" | "tool-assisted" | "maps-specialist"

/**
 * Wanting a *place* is what needs a tool, and riders say so with concrete
 * nouns. These are matched as whole words against the rider's own message
 * only — never against route or place data, which is untrusted.
 */
const PLACE_NOUNS = [
  "brewery", "breweries", "brewpub", "beer", "pub", "bar", "taproom",
  "coffee", "cafe", "café", "espresso", "diner", "restaurant", "food",
  "lunch", "dinner", "breakfast", "brunch", "eat", "snack", "bite",
  "gas", "fuel", "petrol", "charging", "charger",
  "hotel", "motel", "camp", "campground", "campsite", "lodging",
  "stop", "stops", "stopover", "waypoint",
  "town", "city", "village", "viewpoint", "overlook", "waterfall", "park"
]

/**
 * Verbs that mean "go and find/change something", as opposed to "tell me about
 * what I am already looking at".
 */
const DISCOVERY_VERBS = [
  "find", "search", "look up", "lookup", "locate", "discover",
  "add", "insert", "include", "put", "route me", "take me", "send me",
  "build", "plan", "make me", "give me a ride", "design", "create",
  "suggest a", "recommend a", "recommend some", "where can i", "where should i",
  "somewhere", "anywhere", "near", "nearby", "around", "along the way", "on the way",
  "halfway", "midway", "end at", "ending at", "finish at", "start at", "stop at"
]

/**
 * Questions that are answered by the briefing alone. These are only ever used
 * to *confirm* a route-only reading, never to force one.
 */
const ROUTE_ONLY_MARKERS = [
  "worth it", "worth the", "which route", "which one", "which would",
  "would you take", "should i take", "how much gravel", "how much dirt",
  "how much unpaved", "how twisty", "how many curves", "how long",
  "how far", "compare", "difference between", "trade", "tradeoff",
  "trade-off", "why", "explain", "what do you think", "your read",
  "thoughts", "faster", "slower", "shorter", "longer", "highway", "interstate"
]

function normalise(message: string): string {
  return message.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim()
}

function containsWord(haystack: string, needle: string): boolean {
  // Multi-word markers are plain substrings; single words are whole-word
  // matched so "stopped" does not read as a request for a "stop".
  if (needle.includes(" ")) return haystack.includes(needle)
  return new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`).test(haystack)
}

/**
 * Decide the execution mode for one turn.
 *
 * `maps-specialist` is deliberately never returned by the classifier. Paid Maps
 * grounding must not ride along on ordinary turns, so it stays an explicit
 * extension point that a caller opts into, not an inference.
 */
export function classifyTurn(input: AdviceRequest): AdvisorExecutionMode {
  // No route means the rider is building one, which always needs places pinned.
  if (!input.context) return "tool-assisted"

  const message = input.riderMessage?.trim()
  // The opening read on an existing route is a pure explanation of the
  // briefing: Switchback already computed everything it is about.
  if (!message) return "route-only"

  const text = normalise(message)
  if (text.length === 0) return "route-only"

  if (DISCOVERY_VERBS.some((verb) => containsWord(text, verb))) return "tool-assisted"
  if (PLACE_NOUNS.some((noun) => containsWord(text, noun))) return "tool-assisted"
  if (ROUTE_ONLY_MARKERS.some((marker) => containsWord(text, marker))) return "route-only"

  // Unrecognised. Prefer the mode that can still look something up.
  return "tool-assisted"
}

/**
 * The tool declarations a mode is allowed to expose.
 *
 * Route-only returns an empty list, which is what makes it structurally
 * incapable of entering a tool round: a provider with no declarations to send
 * cannot receive a tool call back.
 */
export function toolsForMode(
  mode: AdvisorExecutionMode,
  toolbox: AdvisorToolbox,
  input: AdviceRequest
): AdvisorToolDefinition[] {
  if (mode === "route-only") return []
  return toolbox.definitions(input)
}

/** Whether paid Maps grounding may be attached to this turn. */
export function mapsAllowedForMode(mode: AdvisorExecutionMode, mapsGrounding: boolean): boolean {
  // Route-only answers from the briefing and must stay a single request, so
  // grounding never rides along on one even when the deployment enables it.
  if (mode === "route-only") return false
  return mapsGrounding
}
