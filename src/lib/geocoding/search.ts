import {
  searchPlaces,
  type GeocoderBias,
  type PlaceResult
} from "./photon"
import { searchGoogleTextPlaces } from "@/lib/places/google-places"

export interface DestinationSearchOptions {
  photonBaseUrl: string
  googleApiKey?: string
  bias?: GeocoderBias
  fetcher?: typeof fetch
}

/**
 * Resolve deliberate planner destinations with the highest-quality configured
 * provider, while keeping Photon as the no-key and outage-safe path.
 */
export async function searchDestinationPlaces(
  query: string,
  options: DestinationSearchOptions
): Promise<PlaceResult[]> {
  if (options.googleApiKey?.trim()) {
    try {
      const googlePlaces = await searchGoogleTextPlaces({
        apiKey: options.googleApiKey,
        query,
        bias: options.bias,
        fetcher: options.fetcher
      })
      if (googlePlaces.length > 0) return googlePlaces
    } catch {
      // Photon keeps destination entry functional when the optional paid
      // provider is disabled, rate-limited, or temporarily unavailable.
    }
  }

  return searchPlaces(query, {
    baseUrl: options.photonBaseUrl,
    bias: options.bias,
    fetcher: options.fetcher
  })
}
