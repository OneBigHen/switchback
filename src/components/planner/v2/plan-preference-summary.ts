import type { BikeProfile } from "@/lib/routing/bike-profiles"
import { listProfiles } from "@/lib/routing/profiles"
import type { GravelAtlasPreference, RouteProfileId, TollPolicy } from "@/lib/routing/types"
import type { PlanMode } from "../PlannerDeckViewModel"

export interface PlanPreferenceSummaryInput {
  readonly planMode: PlanMode
  readonly profile: RouteProfileId
  readonly targetMinutes: number
  readonly timeShaped: boolean
  readonly avoidHighways: boolean
  readonly tollPolicy: TollPolicy
  readonly gravelAtlas: GravelAtlasPreference
  readonly bikeProfile?: BikeProfile
}

function durationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Any length"
  return minutes % 60 === 0 ? `${minutes / 60} hr` : `${minutes} min`
}

/**
 * The one-line reading of the rider's current ride preferences.
 *
 * This is a *view* of planner state, not a second copy of it: every part is
 * read from the same fields the detailed controls write, so the row can never
 * drift from the panel it summarises.
 */
export function planPreferenceSummary(input: PlanPreferenceSummaryInput): string[] {
  const parts: string[] = []

  // Loops are always time-shaped; a destination ride is fastest unless the
  // rider asked to trade minutes for better roads.
  parts.push(input.planMode === "loop" || input.timeShaped
    ? durationLabel(input.targetMinutes)
    : "Fastest")

  const profileLabel = listProfiles().find((profile) => profile.id === input.profile)?.label
  if (profileLabel) parts.push(profileLabel)

  if (input.gravelAtlas.enabled) parts.push("Known gravel")
  else if (input.avoidHighways) parts.push("No highways")
  else if (input.tollPolicy === "avoid") parts.push("No tolls")
  else parts.push("Any road")

  return parts
}

export function planPreferenceSummaryLabel(input: PlanPreferenceSummaryInput): string {
  return planPreferenceSummary(input).join(" · ")
}
