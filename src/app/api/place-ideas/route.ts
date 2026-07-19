import { filterFunStopCandidates, searchPlaces, type FunStopKind } from "@/lib/geocoding/photon"
import { searchGooglePopularPlaces } from "@/lib/places/google-places"

export const dynamic = "force-dynamic"

function readKind(value: string | null): FunStopKind | null {
  return value === "brewery" || value === "coffee" || value === "food" || value === "fuel" ? value : null
}

function readCenter(url: URL): { lat: number; lon: number } | null {
  const rawLat = url.searchParams.get("lat")
  const rawLon = url.searchParams.get("lon")
  if (rawLat == null || rawLon == null) return null
  const lat = Number(rawLat)
  const lon = Number(rawLon)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return null
  }
  return { lat, lon }
}

function readRadiusKm(value: string | null): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(5, Math.min(parsed, 50)) : 35
}

function readRouteSamples(value: string | null): { lat: number; lon: number }[] {
  if (!value) return []
  return value.split(";").slice(0, 12).flatMap((sample) => {
    const [rawLat, rawLon, ...extra] = sample.split(",")
    const lat = Number(rawLat)
    const lon = Number(rawLon)
    if (extra.length > 0 || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) return []
    return [{ lat, lon }]
  })
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const kind = readKind(url.searchParams.get("kind"))
  const center = readCenter(url)
  if (!kind || !center) {
    return Response.json({ error: { code: "INVALID_PLACE_IDEA_REQUEST", message: "Choose a stop type and a valid map location." } }, { status: 400 })
  }

  const radiusKm = readRadiusKm(url.searchParams.get("radiusKm"))
  const route = readRouteSamples(url.searchParams.get("route"))
  const googleKey = process.env.GOOGLE_MAPS_API_KEY
  if (googleKey) {
    try {
      const places = await searchGooglePopularPlaces({ apiKey: googleKey, center, kind, route, radiusKm })
      if (places.length > 0) {
        return Response.json({ places, provider: "google", rankedBy: "rider-fit" })
      }
    } catch {
      // A public Photon fallback keeps stop selection usable when a paid
      // provider is disabled, rate-limited, or temporarily unreachable.
    }
  }

  try {
    const places = await searchPlaces(kind, {
      baseUrl: process.env.PHOTON_URL ?? "https://photon.komoot.io/api/",
      bias: center,
      limit: 10
    })
    return Response.json({
      places: filterFunStopCandidates(places, kind, center, radiusKm).slice(0, 5),
      provider: "photon",
      rankedBy: "distance"
    })
  } catch {
    return Response.json({ error: { code: "PLACE_IDEAS_UNAVAILABLE", message: "Stop ideas are temporarily unavailable." } }, { status: 503 })
  }
}
