import type { PlaceResult } from "@/lib/geocoding/photon"
import type { FunStopKind, GeocoderBias } from "@/lib/geocoding/photon"

interface GeocodingPayload {
  places?: PlaceResult[]
  error?: { message?: string }
}

export interface FunStopSearchOptions {
  stopKind: FunStopKind
  radiusKm: number
}

export async function searchPlacesClient(
  query: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
  bias?: GeocoderBias,
  funStop?: FunStopSearchOptions
): Promise<PlaceResult[]> {
  const normalized = query.trim()
  if (normalized.length < 2) return []
  const search = new URLSearchParams({ q: normalized })
  if (bias) {
    search.set("lat", String(bias.lat))
    search.set("lon", String(bias.lon))
  }
  if (funStop) {
    search.set("stopKind", funStop.stopKind)
    search.set("radiusKm", String(funStop.radiusKm))
  }
  const response = await fetcher(`/api/geocode?${search}`, {
    headers: { accept: "application/json" },
    signal
  })
  const payload = await response.json() as GeocodingPayload
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Place search is unavailable.")
  }
  return payload.places ?? []
}
