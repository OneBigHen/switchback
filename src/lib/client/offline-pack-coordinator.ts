import type { PlannedRoute } from "@/lib/routing/types"
import type { OfflineGraph } from "@/lib/offline/graph"
import { buildCorridorManifest } from "@/lib/offline/corridor-manifest"
import { extractCorridorGraph } from "@/lib/offline/corridor-extractor"
import { suggestRegionsForRoute } from "@/lib/offline/region-catalog"
import { RegionDownloadClient } from "@/lib/storage/region-download-client"
import {
  corridorMilesToHalfWidthMeters,
  SAVED_RIDE_CORRIDOR_DEFAULT_MILES,
  type OfflineDownloadLevel
} from "@/lib/offline/download-mode"

export interface OfflinePackCorridorResult {
  graph: OfflineGraph | null
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
 * Attempt to build a corridor graph for a route from downloaded region data.
 *
 * Returns the extracted corridor graph if available, or null with a warning if
 * no suitable region data is downloaded. The caller decides whether to embed
 * the graph in the offline pack.
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
  const maxEstimatedBytes = baseProfile.maxEstimatedBytes

  const waypoints = route.waypoints.map((w) => [w.lon, w.lat] as const)
  if (waypoints.length === 0) {
    return { graph: null, regionIds: [], corridorBytes: 0, warning: "No waypoints to determine region coverage." }
  }

  const suggested = suggestRegionsForRoute(waypoints.map(([lon, lat]) => [lon, lat]))
  if (suggested.length === 0) {
    return { graph: null, regionIds: [], corridorBytes: 0, warning: "No offline region covers this route's waypoints." }
  }

  const availableRegions: string[] = []
  const graphs: OfflineGraph[] = []

  for (const region of suggested) {
    try {
      const graph = await client.getGraph(region.id)
      if (graph) {
        availableRegions.push(region.id)
        graphs.push(graph)
      }
    } catch {
      continue
    }
  }

  if (graphs.length === 0) {
    return {
      graph: null,
      regionIds: [],
      corridorBytes: 0,
      warning: "No offline region data downloaded. Download regions to enable offline routing."
    }
  }

  const manifestResult = buildCorridorManifest(route, {
    corridorWidthMeters,
    maxGraphSegments: MAX_GRAPH_SEGMENTS,
    maxEstimatedBytes,
    sampleSpacingMeters: SAMPLE_SPACING_METERS
  })

  if (!manifestResult.manifest) {
    return {
      graph: null,
      regionIds: availableRegions,
      corridorBytes: 0,
      warning: manifestResult.error?.reason ?? "Could not build corridor for this route."
    }
  }

  for (const regionGraph of graphs) {
    const extraction = extractCorridorGraph(regionGraph, manifestResult.manifest)
    if (extraction.result) {
      return {
        graph: extraction.result.graph,
        regionIds: availableRegions,
        corridorBytes: extraction.result.estimatedBytes,
        warning: null
      }
    }
  }

  return {
    graph: null,
    regionIds: availableRegions,
    corridorBytes: 0,
    warning: "No road data found within the route corridor. Try widening the corridor or downloading a larger region."
  }
}
