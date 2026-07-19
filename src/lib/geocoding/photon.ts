export interface PlaceResult {
  id: string
  label: string
  name: string
  region: string
  country: string
  lat: number
  lon: number
  kind?: string
  rating?: number
  reviewCount?: number
  riderReason?: string
}

export interface GeocoderOptions {
  baseUrl: string
  fetcher?: typeof fetch
  limit?: number
  bias?: GeocoderBias
}

export interface GeocoderBias {
  lat: number
  lon: number
}

export type FunStopKind = "brewery" | "coffee" | "food" | "fuel"

export const FUN_STOP_RADIUS_KM = 35

const DEFAULT_ROUTING_BOUNDS = {
  south: 38.9285,
  west: -80.5199,
  north: 42.5161,
  east: -73.8939
} as const

const DEFAULT_ROUTING_REGIONS = new Set([
  "pa",
  "pennsylvania",
  "commonwealth of pennsylvania",
  "nj",
  "new jersey"
])

function getCoverageBounds(): { south: number; west: number; north: number; east: number } {
  const envBounds = typeof process !== "undefined"
    ? process.env.SWITCHBACK_GEOCODER_BBOX
    : undefined
  if (!envBounds) return DEFAULT_ROUTING_BOUNDS
  const parts = envBounds.split(",").map(Number)
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    return { south: parts[0], west: parts[1], north: parts[2], east: parts[3] }
  }
  return DEFAULT_ROUTING_BOUNDS
}

const COVERAGE_BOUNDS = getCoverageBounds()
const configuredRegions = typeof process !== "undefined"
  ? process.env.SWITCHBACK_GEOCODER_REGION?.toLowerCase()
    .split(",")
    .map((region) => region.trim())
    .filter(Boolean)
  : undefined
const COVERAGE_REGION_MATCHES = configuredRegions?.length
  ? new Set(configuredRegions)
  : DEFAULT_ROUTING_REGIONS

const FUN_STOP_FEATURE_KINDS: Record<FunStopKind, ReadonlySet<string>> = {
  brewery: new Set(["brewery", "pub", "bar", "biergarten"]),
  coffee: new Set(["cafe", "coffee", "coffee_shop"]),
  food: new Set(["restaurant", "fast_food", "food_court", "cafe"]),
  fuel: new Set(["fuel", "gas_station"])
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
  if (
    options.bias &&
    Number.isFinite(options.bias.lat) && options.bias.lat >= -90 && options.bias.lat <= 90 &&
    Number.isFinite(options.bias.lon) && options.bias.lon >= -180 && options.bias.lon <= 180
  ) {
    url.searchParams.set("lat", String(options.bias.lat))
    url.searchParams.set("lon", String(options.bias.lon))
  }

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

  const places = (payload.features ?? []).flatMap((feature, index) => {
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
    const houseNumber = properties.housenumber ?? properties.house_number ?? ""
    const streetAddress = [houseNumber, properties.street].filter(Boolean).join(" ")
    const locality = properties.city && properties.city !== name ? properties.city : ""
    const regionAndPostcode = [region, properties.postcode].filter(Boolean).join(" ")
    const label = [...new Set([
      name,
      streetAddress,
      locality,
      regionAndPostcode,
      country
    ].filter(Boolean))].join(", ")
    const kind = normalizeFeatureKind(
      properties.osm_value ?? properties.type ?? properties.osm_key
    )
    return [{
      id: `${properties.osm_type ?? "feature"}-${properties.osm_id ?? index}`,
      label,
      name,
      region,
      country,
      lat: coordinates[1],
      lon: coordinates[0],
      ...(kind ? { kind } : {})
    }]
  })

  if (!options.bias || !isCoordinateInRoutingCoverage(options.bias)) {
    return places
  }

  return places
    .map((place, index) => ({ place, index }))
    .sort((left, right) =>
      Number(isPlaceInRoutingCoverage(right.place)) -
        Number(isPlaceInRoutingCoverage(left.place)) ||
      (options.bias
        ? distanceInKilometers(options.bias, left.place) - distanceInKilometers(options.bias, right.place)
        : 0) ||
      left.index - right.index
    )
    .map(({ place }) => place)
}

export function selectPreferredPlace(
  places: PlaceResult[],
  bias?: GeocoderBias
): PlaceResult | undefined {
  if (!bias) return places[0]
  const candidates = isCoordinateInRoutingCoverage(bias)
    ? places.filter(isPlaceInRoutingCoverage)
    : places
  const pool = candidates.length > 0 ? candidates : places
  return [...pool].sort((left, right) =>
    distanceInKilometers(bias, left) - distanceInKilometers(bias, right)
  )[0]
}

export function filterFunStopCandidates(
  places: PlaceResult[],
  stopKind: FunStopKind,
  center: GeocoderBias,
  radiusKm = FUN_STOP_RADIUS_KM
): PlaceResult[] {
  const allowedKinds = FUN_STOP_FEATURE_KINDS[stopKind]
  const boundedRadius = Math.max(5, Math.min(radiusKm, 50))

  return places
    .map((place, index) => ({
      place,
      index,
      distanceKm: distanceInKilometers(center, place)
    }))
    .filter(({ place, distanceKm }) =>
      typeof place.kind === "string" &&
      allowedKinds.has(normalizeFeatureKind(place.kind)) &&
      distanceKm <= boundedRadius
    )
    .sort((left, right) =>
      (right.place.reviewCount ?? 0) - (left.place.reviewCount ?? 0) ||
      (right.place.rating ?? 0) - (left.place.rating ?? 0) ||
      left.distanceKm - right.distanceKm ||
      left.index - right.index
    )
    .map(({ place }) => place)
}

export function selectFunStopCandidate(
  places: PlaceResult[],
  stopKind: FunStopKind,
  center: GeocoderBias,
  radiusKm = FUN_STOP_RADIUS_KM
): PlaceResult | undefined {
  return filterFunStopCandidates(places, stopKind, center, radiusKm)[0]
}

function isCoordinateInRoutingCoverage(point: GeocoderBias): boolean {
  return point.lat >= COVERAGE_BOUNDS.south &&
    point.lat <= COVERAGE_BOUNDS.north &&
    point.lon >= COVERAGE_BOUNDS.west &&
    point.lon <= COVERAGE_BOUNDS.east
}

function isPlaceInRoutingCoverage(place: PlaceResult): boolean {
  if (!isCoordinateInRoutingCoverage(place)) return false
  const region = place.region.trim().toLowerCase()
  return COVERAGE_REGION_MATCHES.has(region)
}

function normalizeFeatureKind(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? ""
}

function distanceInKilometers(from: GeocoderBias, to: GeocoderBias): number {
  const earthRadiusKm = 6_371
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = toRadians(to.lat - from.lat)
  const longitudeDelta = toRadians(to.lon - from.lon)
  const fromLatitude = toRadians(from.lat)
  const toLatitude = toRadians(to.lat)
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
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
    street?: string
    housenumber?: string
    house_number?: string
    postcode?: string
    osm_key?: string
    osm_value?: string
    type?: string
  }
}

interface PhotonResponse {
  features?: PhotonFeature[]
}
