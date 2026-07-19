import {
  filterFunStopCandidates,
  FUN_STOP_RADIUS_KM,
  type FunStopKind,
  type GeocoderBias,
  type PlaceResult
} from "@/lib/geocoding/photon"

export type PlaceSearcher = (query: string, bias?: GeocoderBias) => Promise<PlaceResult[]>

export async function handleGeocodeRequest(
  request: Request,
  searcher: PlaceSearcher
): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? ""
  if (query.length < 2) {
    return Response.json({ places: [] })
  }
  const url = new URL(request.url)
  const lat = Number(url.searchParams.get("lat"))
  const lon = Number(url.searchParams.get("lon"))
  const bias = Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lon) && lon >= -180 && lon <= 180 &&
    url.searchParams.has("lat") && url.searchParams.has("lon")
    ? { lat, lon }
    : undefined
  const stopKind = readFunStopKind(url.searchParams.get("stopKind"))
  const radiusParameter = url.searchParams.get("radiusKm")
  const requestedRadius = radiusParameter == null ? Number.NaN : Number(radiusParameter)
  const radiusKm = Number.isFinite(requestedRadius)
    ? Math.max(5, Math.min(requestedRadius, 50))
    : FUN_STOP_RADIUS_KM

  try {
    const places = bias ? await searcher(query, bias) : await searcher(query)
    return Response.json({
      places: stopKind
        ? bias ? filterFunStopCandidates(places, stopKind, bias, radiusKm) : []
        : places
    })
  } catch (error) {
    const status = readErrorStatus(error)
    const code = readErrorCode(error)
    const message = error instanceof Error ? error.message : "Place search failed."
    return Response.json({ error: { code, message } }, { status })
  }
}

function readFunStopKind(value: string | null): FunStopKind | null {
  return value === "brewery" || value === "coffee" || value === "food" ? value : null
}

function readErrorStatus(error: unknown): number {
  if (typeof error === "object" && error && "status" in error) {
    const status = Number(error.status)
    if (status >= 400 && status <= 599) return status
  }
  return 503
}

function readErrorCode(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) {
    return String(error.code)
  }
  return "GEOCODER_UNAVAILABLE"
}
