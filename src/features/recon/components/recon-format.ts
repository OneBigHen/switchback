import type { ReconTrack } from "@/features/recon/types"

/**
 * Shared, side-effect-free formatting for Recon UI. Observed facts render
 * as facts; unknown facts render as nothing at all — never a fake zero.
 */

const METERS_PER_MILE = 1609.344

export function formatTrackMiles(meters: number): string {
  return `${(meters / METERS_PER_MILE).toFixed(1)} mi`
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

/** One-line HUD summary of a track's observed facts. */
export function formatTrackHudLine(track: ReconTrack): string {
  const parts: string[] = [formatTrackMiles(track.distanceMeters)]
  if (track.playbackKind === "recorded") {
    if (track.startedAt !== null) parts.push(formatDay(track.startedAt))
    if (track.facts.durationMinutes !== null) parts.push(`${track.facts.durationMinutes} min`)
  } else {
    // Truth in copy: a preview has distance, never a clock.
    parts.push("no recorded time")
  }
  return parts.join(" · ")
}

/** Quieter picker-row summary for a recorded ride. */
export function formatRecordedRowMeta(track: ReconTrack): string {
  const parts: string[] = []
  if (track.startedAt !== null) parts.push(formatDay(track.startedAt))
  parts.push(formatTrackMiles(track.distanceMeters))
  if (track.facts.durationMinutes !== null) parts.push(`${track.facts.durationMinutes} min`)
  return parts.join(" · ")
}
