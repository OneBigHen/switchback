import type { RiderLayerId } from "@/lib/client/map-layers"
import type { GravelAtlasRepository } from "@/lib/roads/gravel-atlas/repository"
import type {
  MapFeatureRequest,
  RiderFeatureCollection,
  RiderFeatureUnavailableSource
} from "@/lib/map-features/osm"

export type RiderMapFeatureProvider = (request: MapFeatureRequest) => Promise<RiderFeatureCollection>

export interface GravelAtlasMapFeatureOptions {
  repository: Pick<GravelAtlasRepository, "queryBounds">
  graphFingerprint: string
  sourceFingerprint?: string
  limit?: number
}

export interface CombinedRiderMapFeatureOptions {
  baseProvider: RiderMapFeatureProvider
  atlasProvider?: RiderMapFeatureProvider
}

const MAX_VIEWPORT_CORRIDORS = 200

function emptyCollection(): RiderFeatureCollection {
  return { type: "FeatureCollection", features: [] }
}

function unavailableForBaseLayers(layers: readonly RiderLayerId[]): RiderFeatureUnavailableSource[] {
  const unavailable: RiderFeatureUnavailableSource[] = []
  if (layers.some((layer) => layer !== "weather")) unavailable.push("osm")
  if (layers.includes("weather")) unavailable.push("weather")
  return unavailable
}

function uniqueUnavailable(values: readonly RiderFeatureUnavailableSource[]): RiderFeatureUnavailableSource[] {
  return Array.from(new Set(values))
}

/**
 * Render only the graph-reconciled runtime corridors. Raw official source
 * geometry never crosses this route-time boundary, and the exact viewport plus
 * active build fingerprints are mandatory parts of configured production reads.
 */
export async function getGravelAtlasMapFeatures(
  request: MapFeatureRequest,
  options: GravelAtlasMapFeatureOptions
): Promise<RiderFeatureCollection> {
  if (!request.layers.includes("gravel-atlas")) return emptyCollection()
  const graphFingerprint = options.graphFingerprint.trim()
  if (!graphFingerprint) throw new Error("A routing graph fingerprint is required for Gravel Atlas map features")
  const sourceFingerprint = options.sourceFingerprint?.trim()
  if (options.sourceFingerprint !== undefined && !sourceFingerprint) {
    throw new Error("A source snapshot fingerprint is required when configured for Gravel Atlas map features")
  }
  const requestedLimit = Number.isFinite(options.limit) ? Math.floor(options.limit ?? MAX_VIEWPORT_CORRIDORS) : MAX_VIEWPORT_CORRIDORS
  const limit = Math.max(1, Math.min(MAX_VIEWPORT_CORRIDORS, requestedLimit))
  const corridors = options.repository.queryBounds({
    ...request.bounds,
    graphFingerprint,
    ...(sourceFingerprint ? { sourceFingerprint } : {}),
    limit
  })
  return {
    type: "FeatureCollection",
    features: corridors.map((corridor) => ({
      type: "Feature" as const,
      properties: {
        layerId: "gravel-atlas",
        name: corridor.label,
        sourceId: corridor.id,
        confidence: String(corridor.confidence),
        verifiedGravelMeters: String(Math.round(corridor.verifiedGravelMeters)),
        longestContinuousGravelMeters: String(Math.round(corridor.longestContinuousGravelMeters)),
        fragmentCount: String(corridor.fragmentCount),
        evidenceSourceCount: String(corridor.sourceIds.length)
      },
      geometry: {
        type: "LineString" as const,
        coordinates: corridor.geometry
      }
    }))
  }
}

/**
 * Atlas is a local provider, never an Overpass selector. Ordinary requests keep
 * the existing public-provider semantics unchanged; when Atlas is selected we
 * split the request, run the independent providers, and preserve whichever
 * side succeeded. An unavailable Atlas therefore cannot erase fuel/weather/etc
 * and, just as importantly, cannot be misreported as a confirmed empty view.
 */
export async function getCombinedRiderMapFeatures(
  request: MapFeatureRequest,
  options: CombinedRiderMapFeatureOptions
): Promise<RiderFeatureCollection> {
  const wantsAtlas = request.layers.includes("gravel-atlas")
  if (!wantsAtlas) return options.baseProvider(request)

  const baseLayers = request.layers.filter((layer) => layer !== "gravel-atlas")
  const baseRequest = { ...request, layers: baseLayers }
  const atlasRequest = { ...request, layers: ["gravel-atlas" as const] }

  const features: RiderFeatureCollection["features"] = []
  const unavailable: RiderFeatureUnavailableSource[] = []

  if (baseLayers.length > 0) {
    try {
      const base = await options.baseProvider(baseRequest)
      features.push(...base.features)
      unavailable.push(...(base.unavailable ?? []))
    } catch {
      unavailable.push(...unavailableForBaseLayers(baseLayers))
    }
  }

  if (!options.atlasProvider) {
    unavailable.push("gravel-atlas")
  } else {
    try {
      const atlas = await options.atlasProvider(atlasRequest)
      features.push(...atlas.features)
      unavailable.push(...(atlas.unavailable ?? []))
    } catch {
      unavailable.push("gravel-atlas")
    }
  }

  const unique = uniqueUnavailable(unavailable)
  return {
    type: "FeatureCollection",
    features,
    ...(unique.length > 0 ? { unavailable: unique } : {})
  }
}
