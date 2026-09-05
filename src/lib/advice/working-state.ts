import type { PlannedRoute } from "@/lib/routing/types"

/**
 * What the co-pilot can honestly say it is doing, before the model has said
 * anything at all.
 *
 * A route-only turn is answered from facts Switchback has already computed and
 * the rider is already looking at. So while the model is thinking, the UI does
 * not have to fall back to a content-free spinner: it can name the actual
 * comparison being made, drawn **only** from local deterministic route data.
 *
 * This is deliberately not a preview of the answer. It never predicts a verdict,
 * never guesses, and never renders model output — the model has not spoken yet.
 * It states the arithmetic Switchback already did, which is true whatever the
 * advisor eventually concludes. Unvalidated model reasoning must never appear
 * here or anywhere else in the thread.
 */

/** Percent of a route's mapped surface that is unpaved, or null when unknown. */
function unpavedShare(route: PlannedRoute): number | null {
  const mix = route.surfaceMix as Record<string, unknown> | undefined
  const unpaved = mix?.unpaved
  return typeof unpaved === "number" && Number.isFinite(unpaved) ? unpaved : null
}

function round(value: number): number {
  return Math.round(value)
}

export interface WorkingStateInput {
  routes: readonly PlannedRoute[]
  selectedRouteId: string
}

/**
 * A factual working line for the selected route, or null when there is nothing
 * specific to say — in which case the caller should keep its generic wording
 * rather than inventing a fact to fill the gap.
 */
export function workingStateLine(input: WorkingStateInput): string | null {
  const selected = input.routes.find((route) => route.id === input.selectedRouteId)
  if (!selected) return null

  // The fastest candidate is the reference the rider is implicitly trading
  // against, and it is the same reference the briefing uses.
  const fastest = [...input.routes].sort((left, right) => left.durationMinutes - right.durationMinutes)[0]
  if (!fastest) return null

  const facts: string[] = []

  if (fastest.id !== selected.id) {
    const addedMinutes = round(selected.durationMinutes - fastest.durationMinutes)
    if (addedMinutes > 0) facts.push(`+${addedMinutes} min`)
  }

  const selectedUnpaved = unpavedShare(selected)
  const fastestUnpaved = unpavedShare(fastest)
  if (selectedUnpaved !== null && selectedUnpaved > 0) {
    const delta = fastestUnpaved !== null ? selectedUnpaved - fastestUnpaved : selectedUnpaved
    if (delta > 0.01) facts.push(`+${round(delta * 100)}% unpaved`)
    else facts.push(`${round(selectedUnpaved * 100)}% unpaved`)
  }

  if (fastest.id !== selected.id) {
    const curveDelta = round(selected.twistiness - fastest.twistiness)
    if (curveDelta > 0) facts.push(`+${curveDelta} curve score`)
  } else if (Number.isFinite(selected.twistiness) && selected.twistiness > 0) {
    // A "0/100 curve score" is a nothing-fact dressed up as one; say nothing.
    facts.push(`a ${round(selected.twistiness)}/100 curve score`)
  }

  if (facts.length === 0) return null
  return `Weighing ${joinFacts(facts)}…`
}

function joinFacts(facts: readonly string[]): string {
  if (facts.length === 1) return facts[0]!
  if (facts.length === 2) return `${facts[0]} against ${facts[1]}`
  return `${facts.slice(0, -1).join(", ")} and ${facts.at(-1)}`
}
