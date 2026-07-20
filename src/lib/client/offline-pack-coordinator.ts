import type { PlannedRoute } from "@/lib/routing/types"
import type { OfflineGraph } from "@/lib/offline/graph"
import { buildCorridorManifest } from "@/lib/offline/corridor-manifest"
import { extractCorridorGraph } from "@/lib/offline/corridor-extractor"
import { suggestRegionsForRoute } from "@/lib/offline/region-catalog"
import { RegionDownloadClient } from "@/lib/storage/region-download-client"

export interface OfflinePackCorridorResult {
  graph: OfflineGraph | null
  regionIds: string[]
  corridorBytes: number
  warning: string | null
}

const CORRIDOR_WIDTH_METERS = 500
const MAX_GRAPH_SEGMENTS = 50
const MAX_ESTIMATED_BYTES = 5_000_000
const SAMPLE_SPACING_METERS = 200

/**
 * Attempt to build a corridor graph for a route from downloaded region data.
 *
 * Returns the extracted corridor graph if available, or null with a warning if
 * no suitable region data is downloaded. The caller decides whether to embed
 * the graph in the offline pack.
 *
 * Never throws — all errors surface as `warning`.
 */
export async function buildOfflinePackCorridor(
  route: PlannedRoute
): Promise<OfflinePackCorridorResult> {
  const client = new RegionDownloadClient()

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
    corridorWidthMeters: CORRIDOR_WIDTH_METERS,
    maxGraphSegments: MAX_GRAPH_SEGMENTS,
    maxEstimatedBytes: MAX_ESTIMATED_BYTES,
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
