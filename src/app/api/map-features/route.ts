import { handleMapFeaturesRequest } from "./handler"
import { getRiderMapFeatures } from "@/lib/map-features/osm"
import {
  getCombinedRiderMapFeatures,
  getGravelAtlasMapFeatures,
  type RiderMapFeatureProvider
} from "@/lib/map-features/gravel-atlas"
import { GravelAtlasRepository } from "@/lib/roads/gravel-atlas/repository"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"

export const dynamic = "force-dynamic"

// Overpass aggressively bans heavy clients and NWS throttles by UA; keep a
// public instance from getting its IPs blocked by other people's requests.
const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: "map feature request" })

function atlasProvider(): RiderMapFeatureProvider | undefined {
  const databasePath = process.env.GRAVEL_ATLAS_DB_PATH?.trim()
  const graphFingerprint = process.env.GRAVEL_ATLAS_GRAPH_FINGERPRINT?.trim()
  const sourceFingerprint = process.env.GRAVEL_ATLAS_SOURCE_FINGERPRINT?.trim()
  if (!databasePath || !graphFingerprint || !sourceFingerprint) return undefined
  const repository = new GravelAtlasRepository(databasePath)
  return (request) => getGravelAtlasMapFeatures(request, {
    repository,
    graphFingerprint,
    sourceFingerprint,
    limit: 200
  })
}

async function handleMapFeaturesGet(request: Request): Promise<Response> {
  return handleMapFeaturesRequest(request, (featureRequest) => getCombinedRiderMapFeatures(featureRequest, {
    baseProvider: (baseRequest) => getRiderMapFeatures(baseRequest, {
      overpassUrl: process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
      nwsUserAgent: process.env.NWS_USER_AGENT ?? "Switchback route planner (map alerts)"
    }),
    atlasProvider: atlasProvider()
  }))
}

export const GET = withRateLimit(requestLimiter, handleMapFeaturesGet)
