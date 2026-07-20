/**
 * Three offline download choices, instead of one vague Download button.
 * Each level is a different packaged artifact so the rider can choose
 * the storage and route-readiness trade-off that matches the trip.
 */
export type OfflineDownloadLevel = "routing-only" | "full-region" | "saved-ride-corridor"

export interface OfflineDownloadLevelOption {
  level: OfflineDownloadLevel
  label: string
  description: string
  /** Default corridor half-width in miles, when applicable. */
  defaultCorridorMiles?: number
}

export const OFFLINE_DOWNLOAD_LEVELS: readonly OfflineDownloadLevelOption[] = [
  {
    level: "routing-only",
    label: "Routing only",
    description:
      "Routing graph, road metadata, access restrictions, search index, and basic route context. Lowest storage usage."
  },
  {
    level: "full-region",
    label: "Full offline region",
    description:
      "Routing graph plus base-map vector data, labels, terrain or hillshade where available, and offline search. Best for broad travel."
  },
  {
    level: "saved-ride-corridor",
    label: "Saved ride corridor",
    description:
      "Only the route and a configurable buffer around it. The easiest option offered before starting a ride.",
    defaultCorridorMiles: 10
  }
] as const

/** Rider-facing defaults for the corridor width by trip type. */
export const SAVED_RIDE_CORRIDOR_DEFAULT_MILES: Readonly<{
  street: number
  adventure: number
  multiday: number
}> = Object.freeze({
  street: 10,
  adventure: 20,
  multiday: 30
})

export function getDownloadLevelOption(level: OfflineDownloadLevel): OfflineDownloadLevelOption | undefined {
  return OFFLINE_DOWNLOAD_LEVELS.find((option) => option.level === level)
}

/** Convert a corridor width in miles to the half-width meters corridor-manifests expect. */
export function corridorMilesToHalfWidthMeters(miles: number): number {
  const metersPerMile = 1609.344
  return Math.max(50, Math.round(miles * metersPerMile))
}
