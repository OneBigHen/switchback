import { handleMapFeaturesRequest } from "./handler"
import { getRiderMapFeatures } from "@/lib/map-features/osm"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"

export const dynamic = "force-dynamic"

// Overpass aggressively bans heavy clients and NWS throttles by UA; keep a
// public instance from getting its IPs blocked by other people's requests.
const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: "map feature request" })

async function handleMapFeaturesGet(request: Request): Promise<Response> {
  return handleMapFeaturesRequest(request, (featureRequest) => getRiderMapFeatures(featureRequest, {
    overpassUrl: process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter",
    nwsUserAgent: process.env.NWS_USER_AGENT ?? "Switchback route planner (map alerts)"
  }))
}

export const GET = withRateLimit(requestLimiter, handleMapFeaturesGet)
