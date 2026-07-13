export interface PlaceResult {
  id: string
  label: string
  name: string
  region: string
  country: string
  lat: number
  lon: number
}

export interface GeocoderOptions {
  baseUrl: string
  fetcher?: typeof fetch
  limit?: number
}

export class GeocoderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
  }
}

export async function searchPlaces(
  query: string,
  options: GeocoderOptions
): Promise<PlaceResult[]> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < 2) return []

  const url = new URL(options.baseUrl)
  url.searchParams.set("q", normalizedQuery)
  url.searchParams.set("limit", String(Math.max(1, Math.min(options.limit ?? 6, 10))))

  let response: Response
  try {
    response = await (options.fetcher ?? fetch)(url, {
      headers: {
        accept: "application/geo+json, application/json"
      },
      signal: AbortSignal.timeout(8_000)
    })
  } catch {
    throw new GeocoderError(
      "Place search is temporarily unavailable",
      "GEOCODER_UNAVAILABLE",
      503
    )
  }

  if (!response.ok) {
    throw new GeocoderError(
      "Place search is temporarily unavailable",
      "GEOCODER_UNAVAILABLE",
      response.status
    )
  }

  let payload: PhotonResponse
  try {
    payload = (await response.json()) as PhotonResponse
  } catch {
    throw new GeocoderError(
      "Place search returned an unreadable response",
      "INVALID_GEOCODER_RESPONSE",
      502
    )
  }

  return (payload.features ?? []).flatMap((feature, index) => {
    const coordinates = feature.geometry?.coordinates
    if (
      feature.geometry?.type !== "Point" ||
      !coordinates ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1])
    ) {
      return []
    }
    const properties = feature.properties ?? {}
    const name = properties.name ?? properties.city ?? properties.county ?? "Unnamed place"
    const region = properties.state ?? properties.county ?? ""
    const country = properties.country ?? ""
    const label = [...new Set([name, region, country].filter(Boolean))].join(", ")
    return [{
      id: `${properties.osm_type ?? "feature"}-${properties.osm_id ?? index}`,
      label,
      name,
      region,
      country,
      lat: coordinates[1],
      lon: coordinates[0]
    }]
  })
}

interface PhotonFeature {
  geometry?: {
    type?: string
    coordinates?: [number, number]
  } | null
  properties?: {
    osm_id?: string | number
    osm_type?: string
    name?: string
    city?: string
    county?: string
    state?: string
    country?: string
  }
}

interface PhotonResponse {
  features?: PhotonFeature[]
}
