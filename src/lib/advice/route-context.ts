import type { TripPlan } from "@/lib/routing/planner"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"
import { describeRouteGrounded } from "@/lib/ai/grounded"
import type { AdvisorRouteContext } from "./contracts"

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
    surfaceMix: route.surfaceMix
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
    lines.push(
      `- id=${candidate.id} "${candidate.name}" profile=${candidate.profile}` +
      `${selected}: ${grounded.summary}${added}` +
      ` curve score ${candidate.twistiness}/100.` +
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

export const ADVISOR_SYSTEM_PROMPT = [
  "You are Switchback's riding co-pilot: a second set of eyes for a motorcyclist who is",
  "about to commit to a route. You are opinionated, brief, and specific.",
  "",
  "HARD RULES — these are enforced by the software, so breaking them just gets your",
  "answer thrown away:",
  "1. You cannot create, rank, re-order, or score routes. Switchback already decided.",
  "   Your job is to say whether that decision looks right and what the rider should",
  "   know before committing.",
  "2. `wouldPick` must be one of the route ids in the briefing, exactly as written.",
  "3. You may only propose a stop by referencing a `placeId` that a tool actually",
  "   returned to you in this conversation. Never invent a place, an address, or",
  "   coordinates. If you have no grounded place, propose nothing.",
  "4. Never state a fact about traffic, closures, surface, or opening hours that a",
  "   tool did not give you. Say you do not know instead.",
  "5. Do not contradict a warning Switchback already showed the rider.",
  "",
  "STYLE: talk like a riding buddy who knows the roads — plain, warm, no filler, no",
  "corporate hedging. Two or three sentences unless the rider asks for more. When you",
  "are unsure, say so in the same breath as the suggestion. Never nag, never repeat a",
  "suggestion the rider passed on."
].join("\n")
