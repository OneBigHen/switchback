import type { FunStopKind, GeocoderBias, PlaceResult } from "@/lib/geocoding/photon"

export interface PlaceIdeasResult {
  places: PlaceResult[]
  provider: "google" | "photon"
  rankedBy: "rider-fit" | "distance"
}

interface PlaceIdeasPayload extends Partial<PlaceIdeasResult> {
  error?: { message?: string }
}

export async function discoverPlaceIdeas(
  kind: FunStopKind,
  center: GeocoderBias,
  radiusKm = 35,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
  route: readonly [number, number][] = []
): Promise<PlaceIdeasResult> {
  const query = new URLSearchParams({
    kind,
    lat: String(center.lat),
    lon: String(center.lon),
    radiusKm: String(radiusKm)
  })
  const samples = route.length <= 12
    ? route
    : Array.from({ length: 12 }, (_, index) => route[Math.round(index * (route.length - 1) / 11)]!)
  if (samples.length > 0) {
    query.set("route", samples.map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(";"))
  }
  const response = await fetcher(`/api/place-ideas?${query}`, {
    headers: { accept: "application/json" },
    signal
  })
  const payload = await response.json() as PlaceIdeasPayload
  if (!response.ok || !Array.isArray(payload.places) || (payload.provider !== "google" && payload.provider !== "photon")) {
    throw new Error(payload.error?.message ?? "Stop ideas are unavailable.")
  }
  return {
    places: payload.places,
    provider: payload.provider,
    rankedBy: payload.rankedBy === "rider-fit" ? "rider-fit" : "distance"
  }
}
