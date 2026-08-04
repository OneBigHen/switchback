import { handleGeocodeRequest } from "./handler"
import { searchDestinationPlaces } from "@/lib/geocoding/search"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"

export const dynamic = "force-dynamic"

const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 30, label: "place search" })

async function handleGeocodeGet(request: Request): Promise<Response> {
  const baseUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io/api/"
  return handleGeocodeRequest(request, (query, bias) => searchDestinationPlaces(query, {
    photonBaseUrl: baseUrl,
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    bias
  }))
}

export const GET = withRateLimit(requestLimiter, handleGeocodeGet)
