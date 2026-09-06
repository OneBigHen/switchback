import type { PlanMode } from "@/components/planner/PlannerDeckViewModel"

const TRAILING_PLACE_FRAGMENT = /(\b(?:to|near|around|from|starting\s+(?:in|near)|start(?:ing)?\s+(?:in|near|at))\s+)([^,;]{2,100})$/i
const RIDE_PROSE = /\b(?:ride|route|loop|round[ -]?trip|scenic|twist(?:y|ies)|curvy|curves?|gravel|dirt|unpaved|adventure|balanced|quick|fastest|avoid|skip|without|highways?|interstates?|minutes?|mins?|hours?|hrs?|coffee|cafe|brewery|food|lunch|dinner)\b/i

function cleanFragment(value: string): string | null {
  const cleaned = value.replace(/[.!?]+$/, "").trim()
  return cleaned.length >= 2 && cleaned.length <= 100 ? cleaned : null
}

/**
 * Extract only the place-shaped fragment from the omnibox text. This lets the
 * rider keep natural-language constraints ("90-minute scenic loop near …")
 * while the geocoder searches just the location text rather than the entire
 * sentence. Bare short text remains a normal Google-Maps-style place search.
 */
export function ridePromptPlaceQuery(prompt: string): string | null {
  const trimmed = prompt.trim()
  if (trimmed.length < 2) return null

  const trailing = trimmed.match(TRAILING_PLACE_FRAGMENT)
  if (trailing?.[2]) return cleanFragment(trailing[2])

  if (trimmed.length <= 60 && !RIDE_PROSE.test(trimmed)) {
    return cleanFragment(trimmed)
  }
  return null
}

/**
 * Complete the place portion without throwing away the rider's existing
 * intent. A bare place is promoted to an explicit destination or loop origin;
 * a sentence with a trailing place fragment keeps everything before it.
 */
export function completeRidePromptWithPlace(
  prompt: string,
  placeLabel: string,
  planMode: PlanMode
): string {
  const label = placeLabel.trim()
  if (!label) return prompt

  const match = prompt.trim().match(TRAILING_PLACE_FRAGMENT)
  if (match && typeof match.index === "number") {
    const prefixLength = match.index + match[1].length
    return `${prompt.trim().slice(0, prefixLength)}${label}`
  }

  return planMode === "loop" ? `Loop near ${label}` : `Ride to ${label}`
}
