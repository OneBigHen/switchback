import { handleGeocodeRequest } from "./handler"
import { searchPlaces } from "@/lib/geocoding/photon"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const baseUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io/api/"
  return handleGeocodeRequest(request, (query) => searchPlaces(query, { baseUrl }))
}
