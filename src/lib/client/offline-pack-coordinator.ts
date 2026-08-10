import type { PlannedRoute } from "@/lib/routing/types"
import type { OfflineGraphTileV2 } from "@/lib/offline/v2-contracts"
import { buildCorridorManifest } from "@/lib/offline/corridor-manifest"
import { suggestRegionsForRoute } from "@/lib/offline/region-catalog"
import { RegionDownloadClient } from "@/lib/storage/region-download-client"
import {
  corridorMilesToHalfWidthMeters,
  SAVED_RIDE_CORRIDOR_DEFAULT_MILES,
  type OfflineDownloadLevel
} from "@/lib/offline/download-mode"

export interface OfflinePackCorridorResult {
  /** Installed v2 graph tiles covering the route corridor, or null when none. */
  tiles: OfflineGraphTileV2[] | null
  regionIds: string[]
  corridorBytes: number
  warning: string | null
}
export interface OfflinePackCorridorOptions {
  /** Which download level the rider chose. Defaults to `saved-ride-corridor`. */
  level?: OfflineDownloadLevel
  /** Corridor width in miles for `saved-ride-corridor`. Ignored for other levels. */
  corridorMiles?: number
}

interface LevelProfile {
  corridorWidthMeters: number
  maxEstimatedBytes: number
}

const MAX_GRAPH_SEGMENTS = 50
const SAMPLE_SPACING_METERS = 200

const LEVEL_PROFILES: Record<OfflineDownloadLevel, LevelProfile> = {
  "routing-only": {
    corridorWidthMeters: 250,
    maxEstimatedBytes: 2_000_000
  },
  "full-region": {
    corridorWidthMeters: 2_000,
    maxEstimatedBytes: 25_000_000
  },
  "saved-ride-corridor": {
    corridorWidthMeters: corridorMilesToHalfWidthMeters(SAVED_RIDE_CORRIDOR_DEFAULT_MILES.street),
    maxEstimatedBytes: 5_000_000
  }
}

/**
 * Collect the installed v2 regional graph tiles that cover a route's corridor.
 *
 * Returns the intersecting tiles if any installed region provides them, or
 * null with a warning if no suitable region data is downloaded. The caller
 * decides whether to embed the tiles in the offline pack.
 *
 * The corridor width and storage cap are chosen from the rider's selected
 * download level (and `corridorMiles` for the saved-ride-corridor level)
 * instead of the historical hard-coded 500 m / 5 MB profile.
 *
 * Never throws — all errors surface as `warning`.
 */
export async function buildOfflinePackCorridor(
  route: PlannedRoute,
  options: OfflinePackCorridorOptions = {}
): Promise<OfflinePackCorridorResult> {
  const client = new RegionDownloadClient()

  const level: OfflineDownloadLevel = options.level ?? "saved-ride-corridor"
  const baseProfile = LEVEL_PROFILES[level]
  const corridorWidthMeters =
    level === "saved-ride-corridor"
      ? corridorMilesToHalfWidthMeters(options.corridorMiles ?? SAVED_RIDE_CORRIDOR_DEFAULT_MILES.street)
      : baseProfile.corridorWidthMeters

  const waypoints = route.waypoints.map((w) => [w.lon, w.lat] as const)
  if (waypoints.length === 0) {
    return { tiles: null, regionIds: [], corridorBytes: 0, warning: "No waypoints to determine region coverage." }
  }

  const suggested = suggestRegionsForRoute(waypoints.map(([lon, lat]) => [lon, lat]))
  if (suggested.length === 0) {
    return { tiles: null, regionIds: [], corridorBytes: 0, warning: "No offline region covers this route's waypoints." }
  }

  const installed = new Set((await client.list()).map((region) => region.id))
  const availableRegions = suggested.filter((region) => installed.has(region.id))
  if (availableRegions.length === 0) {
    return {
      tiles: null,
      regionIds: suggested.map((region) => region.id),
      corridorBytes: 0,
      warning: "No offline region data downloaded. Download regions to enable offline routing."
    }
  }

  const manifestResult = buildCorridorManifest(route, {
    corridorWidthMeters,
    maxGraphSegments: MAX_GRAPH_SEGMENTS,
    maxEstimatedBytes: baseProfile.maxEstimatedBytes,
    sampleSpacingMeters: SAMPLE_SPACING_METERS
  })

  if (!manifestResult.manifest) {
    return {
      tiles: null,
      regionIds: availableRegions.map((region) => region.id),
      corridorBytes: 0,
      warning: manifestResult.error?.reason ?? "Could not build corridor for this route."
    }
  }

  const searchBounds = {
    minLon: Math.min(...route.geometry.map((point) => point[0])),
    minLat: Math.min(...route.geometry.map((point) => point[1])),
    maxLon: Math.max(...route.geometry.map((point) => point[0])),
    maxLat: Math.max(...route.geometry.map((point) => point[1]))
  }
  const tiles: OfflineGraphTileV2[] = []
  for (const region of availableRegions) {
    try {
      tiles.push(...await client.getActiveGraphTiles(region.id, searchBounds))
    } catch {
      continue
    }
  }
  if (tiles.length === 0) {
    return {
      tiles: null,
      regionIds: availableRegions.map((region) => region.id),
      corridorBytes: 0,
      warning: "No road data found within the route corridor. Try widening the corridor or downloading a larger region."
    }
  }

  const corridorBytes = new TextEncoder().encode(JSON.stringify(tiles)).byteLength
  return {
    tiles,
    regionIds: availableRegions.map((region) => region.id),
    corridorBytes,
    warning: null
  }
}
