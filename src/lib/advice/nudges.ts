import type { PlannedRoute } from "@/lib/routing/types"

/**
 * Proactive nudges — the surface most likely to feel like Clippy, so it is the
 * one built with the least freedom.
 *
 * A nudge is **deterministic**. It is derived from the plan Switchback already
 * computed, it costs nothing, it takes no time, and it cannot be wrong about a
 * fact because every number in it came off the route contract. No model is
 * consulted to decide whether to speak or what to say. What the advisor is for
 * is the conversation *after* the rider taps the nudge.
 *
 * The rules, all enforced here rather than by the component:
 *
 * - At most one nudge at a time, highest priority wins.
 * - Every nudge names a specific, checkable number. "You might like this" is
 *   not a nudge; "the Leaner option saves 26 minutes and keeps 78% of your
 *   line" is.
 * - A dismissed nudge never comes back for that plan.
 * - Nothing fires at all unless it clears a materiality threshold, so a plan
 *   the rider already understands stays silent — which is the common case.
 */

export type NudgeKind =
  | "faster-option"
  | "gravel-ahead"
  | "much-twistier"
  | "corridor-tradeoff"
  | "long-ride"

export interface Nudge {
  /** Stable per plan, so a dismissal sticks. */
  id: string
  kind: NudgeKind
  /** One line, with the number in it. */
  text: string
  /** What tapping it asks the advisor. Empty means it is informational only. */
  followUp: string
  /** Route this nudge is about, when it points at one. */
  routeId?: string
}

const UNPAVED = new Set([
  "compacted", "dirt", "earth", "fine_gravel", "grass", "gravel", "ground", "mud", "sand", "unpaved"
])

/** Below these, the difference is not worth a rider's attention. */
const MIN_MINUTES_SAVED = 15
const MIN_TWISTINESS_GAIN = 18
const MIN_UNPAVED_PERCENT = 12
const LONG_RIDE_MINUTES = 210

function unpavedPercent(route: PlannedRoute): number {
  const total = Object.values(route.surfaceMix).reduce((sum, share) => sum + Math.max(0, share), 0)
  if (total <= 0) return 0
  const unpaved = Object.entries(route.surfaceMix)
    .reduce((sum, [surface, share]) =>
      sum + (UNPAVED.has(surface.toLowerCase()) ? Math.max(0, share) : 0), 0)
  return Math.round((unpaved / total) * 100)
}

/** Priority order: the higher a kind sits, the more it earns the one slot. */
const PRIORITY: readonly NudgeKind[] = [
  "gravel-ahead",
  "much-twistier",
  "faster-option",
  "corridor-tradeoff",
  "long-ride"
]

export interface NudgeInput {
  routes: readonly PlannedRoute[]
  selectedRouteId: string
  /** Nudge ids the rider has already dismissed for this plan. */
  dismissed: readonly string[]
}

/**
 * The single nudge worth showing, or null. Pure: same plan in, same nudge out,
 * which is what makes it testable and what stops it nagging.
 */
export function selectNudge(input: NudgeInput): Nudge | null {
  const selected = input.routes.find((route) => route.id === input.selectedRouteId)
  if (!selected || input.routes.length === 0) return null
  const others = input.routes.filter((route) => route.id !== selected.id)
  const dismissed = new Set(input.dismissed)
  const candidates: Nudge[] = []

  // The rider is on a dual-sport. Mapped gravel on the chosen route is the
  // single most useful thing to point out, and it is a fact, not a taste.
  const gravel = unpavedPercent(selected)
  if (gravel >= MIN_UNPAVED_PERCENT) {
    candidates.push({
      id: `gravel-${selected.id}-${gravel}`,
      kind: "gravel-ahead",
      text: `${gravel}% of this route is mapped unpaved — about ${(selected.distanceMiles * gravel / 100).toFixed(1)} mi of it.`,
      followUp: "What's the unpaved section on this route actually like?",
      routeId: selected.id
    })
  }

  // A markedly twistier option the rider may not have compared.
  const twistier = others
    .filter((route) => route.twistiness - selected.twistiness >= MIN_TWISTINESS_GAIN)
    .sort((left, right) => right.twistiness - left.twistiness)[0]
  if (twistier) {
    const added = Math.round(twistier.durationMinutes - selected.durationMinutes)
    candidates.push({
      id: `twistier-${twistier.id}`,
      kind: "much-twistier",
      text: `"${twistier.name}" scores ${Math.round(twistier.twistiness)} on curves against ${Math.round(selected.twistiness)}` +
        `${added > 0 ? `, for ${added} more minutes` : " for no extra time"}.`,
      followUp: `Is "${twistier.name}" worth the extra time over what I've got selected?`,
      routeId: twistier.id
    })
  }

  // A meaningfully faster option — stated as a fact, never as a nudge to hurry.
  const faster = others
    .filter((route) => selected.durationMinutes - route.durationMinutes >= MIN_MINUTES_SAVED)
    .sort((left, right) => left.durationMinutes - right.durationMinutes)[0]
  if (faster) {
    candidates.push({
      id: `faster-${faster.id}`,
      kind: "faster-option",
      text: `"${faster.name}" gets there ${Math.round(selected.durationMinutes - faster.durationMinutes)} minutes sooner if you're short on time.`,
      followUp: `What do I give up by taking "${faster.name}" instead?`,
      routeId: faster.id
    })
  }

  // Free-draw only: the rider drew a line, so the trade-off against it is the
  // thing they actually want to know.
  if (selected.corridorOption && selected.corridorAdherence) {
    const kept = Math.round(selected.corridorAdherence.coveredShare * 100)
    const looser = others.find((route) =>
      route.corridorAdherence !== undefined &&
      route.corridorAdherence.coveredShare < selected.corridorAdherence!.coveredShare)
    if (looser && kept < 95) {
      candidates.push({
        id: `corridor-${selected.id}-${kept}`,
        kind: "corridor-tradeoff",
        text: `This keeps ${kept}% of the line you drew. "${looser.name}" wanders further but ${
          looser.durationMinutes < selected.durationMinutes
            ? `saves ${Math.round(selected.durationMinutes - looser.durationMinutes)} minutes`
            : "picks up different roads"
        }.`,
        followUp: `How do these options differ from the line I drew?`,
        routeId: looser.id
      })
    }
  }

  // A long day is worth planning fuel and food around.
  if (selected.durationMinutes >= LONG_RIDE_MINUTES) {
    candidates.push({
      id: `long-${selected.id}-${Math.round(selected.durationMinutes / 30)}`,
      kind: "long-ride",
      text: `That's ${Math.round(selected.durationMinutes / 60 * 10) / 10} hours of riding — worth planning a stop.`,
      followUp: "Where should I stop for food and fuel on this ride?",
      routeId: selected.id
    })
  }

  for (const kind of PRIORITY) {
    const nudge = candidates.find((candidate) => candidate.kind === kind && !dismissed.has(candidate.id))
    if (nudge) return nudge
  }
  return null
}
