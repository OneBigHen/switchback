import { handleGeocodeRequest } from "./handler"
import { searchDestinationPlaces } from "@/lib/geocoding/search"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const baseUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io/api/"
  return handleGeocodeRequest(request, (query, bias) => searchDestinationPlaces(query, {
    photonBaseUrl: baseUrl,
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    bias
  }))
}
