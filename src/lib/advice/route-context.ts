import type { TripPlan } from "@/lib/routing/planner"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"
import { describeRouteGrounded } from "@/lib/ai/grounded"
import type { AdviceRequest, AdvisorRouteContext } from "./contracts"

/**
 * Turning a plan into what the advisor is allowed to know.
 *
 * The briefing is facts only, drawn from the route contract Switchback already
 * computed. Nothing here is inferred, and geometry is downsampled so a long
 * ride cannot blow the context window — the advisor reasons about the shape of
 * the ride, not about every vertex.
 */

/** Geometry handed to the advisor and to along-route grounding. */
export const MAX_CONTEXT_GEOMETRY = 40

export function sampleGeometry(
  geometry: readonly Coordinate[],
  limit = MAX_CONTEXT_GEOMETRY
): Coordinate[] {
  const usable = geometry.filter((coordinate) =>
    Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]))
  if (usable.length <= limit) return [...usable]
  return Array.from({ length: limit }, (_, index) => {
    const source = Math.round(index * (usable.length - 1) / (limit - 1))
    return usable[source]!
  })
}

function candidateSummary(route: PlannedRoute): AdvisorRouteContext["candidates"][number] {
  return {
    id: route.id,
    name: route.name,
    profile: route.profile,
    distanceMiles: Number(route.distanceMiles.toFixed(1)),
    durationMinutes: Math.round(route.durationMinutes),
    twistiness: Math.round(route.twistiness),
    turnCount: route.turnCount,
    roadMix: route.roadMix,
    surfaceMix: route.surfaceMix,
    ...(route.corridorOption ? { corridorOption: route.corridorOption } : {})
  }
}

export function advisorContextFromPlan(plan: TripPlan): AdvisorRouteContext | null {
  const selected = plan.routes.find((route) => route.id === plan.selectedRouteId) ?? plan.routes[0]
  if (!selected) return null
  return {
    selectedRouteId: selected.id,
    candidates: plan.routes.map(candidateSummary),
    geometry: sampleGeometry(selected.geometry),
    warnings: plan.warnings.slice(0, 8)
  }
}

const UNPAVED = new Set([
  "compacted", "dirt", "earth", "fine_gravel", "grass", "gravel", "ground", "mud", "sand", "unpaved"
])

function unpavedPercent(mix: Record<string, number>): number {
  const total = Object.values(mix).reduce((sum, share) => sum + Math.max(0, share), 0)
  if (total <= 0) return 0
  const unpaved = Object.entries(mix)
    .reduce((sum, [surface, share]) => sum + (UNPAVED.has(surface.toLowerCase()) ? Math.max(0, share) : 0), 0)
  return Math.round((unpaved / total) * 100)
}

/**
 * The model-visible briefing. Every number here already exists on the route
 * contract; the advisor is told explicitly what is *not* known so it reports
 * uncertainty instead of filling it in.
 */
export function briefingText(context: AdvisorRouteContext): string {
  const lines: string[] = []
  const fastest = [...context.candidates]
    .sort((left, right) => left.durationMinutes - right.durationMinutes)[0]

  lines.push("ROUTE OPTIONS SWITCHBACK PRODUCED (these are the only routes that exist):")
  for (const candidate of context.candidates) {
    const grounded = describeRouteGrounded({
      distanceMiles: candidate.distanceMiles,
      durationMinutes: candidate.durationMinutes,
      turnCount: candidate.turnCount,
      twistiness: candidate.twistiness,
      routingSource: "live",
      surfaceMix: candidate.surfaceMix,
      roadMix: candidate.roadMix
    })
    const added = fastest && candidate.id !== fastest.id
      ? ` (+${Math.max(0, Math.round(candidate.durationMinutes - fastest.durationMinutes))} min vs fastest)`
      : " (fastest)"
    const selected = candidate.id === context.selectedRouteId ? " [SWITCHBACK RECOMMENDS THIS]" : ""
    const unpaved = unpavedPercent(candidate.surfaceMix)
    lines.push(
      `- id=${candidate.id} "${candidate.name}" profile=${candidate.profile}` +
      `${candidate.corridorOption ? ` freeDrawOption=${candidate.corridorOption}` : ""}` +
      `${selected}: ${grounded.summary}${added}` +
      ` curve score ${candidate.twistiness}/100, ${unpaved}% unpaved.` +
      (grounded.unsupported.length > 0
        ? ` Not known for this route: ${grounded.unsupported.join(", ")}.`
        : "")
    )
  }

  if (context.warnings.length > 0) {
    lines.push("", "WARNINGS SWITCHBACK ALREADY SHOWED THE RIDER (do not contradict these):")
    for (const warning of context.warnings) lines.push(`- ${warning}`)
  }

  const start = context.geometry[0]
  const finish = context.geometry.at(-1)
  if (start && finish) {
    lines.push(
      "",
      `The selected route runs from ${start[1].toFixed(4)},${start[0].toFixed(4)}` +
      ` to ${finish[1].toFixed(4)},${finish[0].toFixed(4)}.`
    )
  }
  return lines.join("\n")
}

const PERSONA = [
  "You are Switchback's riding co-pilot. You ride with the person you're talking to.",
  "",
  "WHO YOU'RE TALKING TO: a dual-sport rider. They are not looking for the practical",
  "route — Google Maps does that. They want the ride. Gravel and dirt are a FEATURE,",
  "not a hazard: when a road turns unpaved, say how much and what kind, and treat it",
  "as a reason to go rather than a warning. They like ending up somewhere good — a",
  "brewery, a diner, a lookout — and they would rather add twenty minutes than take",
  "the boring way. Assume they can handle the road unless the surface data says",
  "something genuinely rough, in which case just tell them plainly.",
  "",
  "HARD RULES — enforced by the software, so breaking them only wastes your answer:",
  "1. You cannot create, rank, re-order, or score routes. Switchback's engines do that.",
  "   You explain, you suggest, and you can fill in a ride for the rider to confirm —",
  "   you never choose for them.",
  "2. `wouldPick` must be a route id from the briefing, exactly as written.",
  "3. Every place you name in a stop or a ride must be a `placeId` a tool returned to",
  "   you in this conversation. You do not know coordinates. To use a place Google",
  "   Maps told you about, call lookup_place with its name and address to pin it",
  "   first. Unpinned places are silently dropped.",
  "4. Never state a fact about traffic, closures, surface, or opening hours that a",
  "   tool did not give you. Say you don't know instead.",
  "5. Do not contradict a warning Switchback already showed the rider.",
  "",
  "HOW TO WORK: look things up before you recommend them. Use find_stops for real",
  "places, find_good_roads for roads actually worth riding (surface=unpaved hunts",
  "gravel), and Google Maps to find out whether a place is any good — is the brewery",
  "open, is the diner worth stopping for, is the lookout actually a view. Two or three",
  "tool calls to give one confident answer is the right trade.",
  "",
  "STYLE: talk like a riding buddy who knows these roads. Plain, warm, specific. Two",
  "or three sentences unless asked for more. Name the road, name the beer, give the",
  "number. Have an opinion and say it. When you're unsure, say so in the same breath",
  "as the suggestion. Never nag, never repeat a suggestion they passed on, and never",
  "pad with \"I'd be happy to\" — just answer."
].join("\n")

/** The system instruction for one turn, including the ride under discussion. */
export function advisorSystemPrompt(input: AdviceRequest): string {
  const parts = [PERSONA]
  if (input.context) {
    parts.push("", briefingText(input.context))
    return parts.join("\n")
  }
  parts.push(
    "",
    "THERE IS NO ROUTE YET. The rider is starting from scratch, so your job is to help",
    "them put one together: work out roughly where they're starting, what they feel",
    "like riding, and how long they have, then pin the places with lookup_place and",
    "hand back a proposedRide. Ask at most one question before offering something",
    "concrete — a ride they can look at beats a questionnaire.",
    "",
    "If you name a stop in your message, it MUST also be in waypointPlaceIds, or the",
    "ride you hand back will not actually go there and the rider will notice.",
    input.origin
      ? `The rider is at ${input.origin.lat.toFixed(4)},${input.origin.lon.toFixed(4)}` +
        `${input.origin.label ? ` (${input.origin.label})` : ""}. That location is already pinned for you as ` +
        `placeId "origin" — use it as startPlaceId unless they name somewhere else. Do NOT start a ride ` +
        "at a brewery or a viewpoint just because you looked it up; those are places to ride TO."
      : "You do not know where they are. Ask, or let lookup_place resolve a place they name."
  )
  return parts.join("\n")
}

export { PERSONA as ADVISOR_PERSONA }
