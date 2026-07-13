import type { PlaceResult } from "@/lib/geocoding/photon"

interface GeocodingPayload {
  places?: PlaceResult[]
  error?: { message?: string }
}

export async function searchPlacesClient(
  query: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<PlaceResult[]> {
  const normalized = query.trim()
  if (normalized.length < 2) return []
  const search = new URLSearchParams({ q: normalized })
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
