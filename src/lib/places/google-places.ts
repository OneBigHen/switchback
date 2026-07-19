import type { FunStopKind, GeocoderBias, PlaceResult } from "@/lib/geocoding/photon"

const GOOGLE_NEARBY_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby"
const GOOGLE_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
const GOOGLE_PLACE_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.rating",
  "places.userRatingCount"
].join(",")

const RIDER_STOP_TYPES: Record<FunStopKind, string[]> = {
  brewery: [
    "brewery", "brewpub", "beer_garden", "pub", "bar",
    "park", "state_park", "national_park", "tourist_attraction",
    "historical_landmark", "observation_deck", "hiking_area", "visitor_center"
  ],
  coffee: [
    "coffee_shop", "coffee_roastery", "cafe", "bakery",
    "park", "state_park", "national_park", "tourist_attraction",
    "historical_landmark", "observation_deck", "hiking_area", "visitor_center"
  ],
  food: [
    "restaurant", "cafe", "bakery", "brewery", "brewpub", "pub",
    "park", "state_park", "national_park", "tourist_attraction",
    "historical_landmark", "observation_deck", "hiking_area", "visitor_center"
  ],
  fuel: ["gas_station"]
}

const BREWERY_TYPES = new Set(["brewery", "brewpub", "beer_garden", "pub", "bar"])
const COFFEE_TYPES = new Set(["coffee_shop", "coffee_roastery", "cafe", "bakery"])
const FOOD_TYPES = new Set(["restaurant", "cafe", "bakery"])
const FUEL_TYPES = new Set(["gas_station"])
const SCENIC_TYPES = new Set([
  "park", "state_park", "national_park", "tourist_attraction",
  "historical_landmark", "observation_deck", "hiking_area", "visitor_center"
])

type RiderStopCategory = "brewery" | "coffee" | "food" | "fuel" | "scenic"

export interface GooglePlacesOptions {
  apiKey?: string
  center: GeocoderBias
  route?: readonly GeocoderBias[]
  kind: FunStopKind
  radiusKm?: number
  fetcher?: typeof fetch
}

export interface GoogleTextPlacesOptions {
  apiKey?: string
  query: string
  bias?: GeocoderBias
  fetcher?: typeof fetch
}

export class GooglePlacesError extends Error {
  constructor(
    message: string,
    readonly code: "GOOGLE_PLACES_UNAVAILABLE" | "INVALID_GOOGLE_PLACES_RESPONSE",
    readonly status: number
  ) {
    super(message)
  }
}

interface GooglePlace {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  primaryType?: string
  types?: string[]
  rating?: number
  userRatingCount?: number
}

interface GooglePlacesResponse {
  places?: GooglePlace[]
}

interface GooglePlaceCandidate extends PlaceResult {
  types: string[]
}

function boundedRadiusMeters(radiusKm: number | undefined): number {
  const radius = Number.isFinite(radiusKm) ? radiusKm as number : 35
  return Math.round(Math.max(5, Math.min(radius, 50)) * 1_000)
}

function validCoordinate(center: GeocoderBias): boolean {
  return Number.isFinite(center.lat) && center.lat >= -90 && center.lat <= 90 &&
    Number.isFinite(center.lon) && center.lon >= -180 && center.lon <= 180
}

function normalizePlace(place: GooglePlace, index: number): GooglePlaceCandidate | null {
  const latitude = place.location?.latitude
  const longitude = place.location?.longitude
  if (
    typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) return null
  const types = [...new Set([place.primaryType, ...(place.types ?? [])]
    .filter((type): type is string => typeof type === "string" && type.length > 0))]
  if (types.length === 0) return null

  const name = place.displayName?.text?.trim() || "Unnamed place"
  const address = place.formattedAddress?.trim() ?? ""
  const rating = typeof place.rating === "number" && Number.isFinite(place.rating)
    ? place.rating
    : undefined
  const reviewCount = typeof place.userRatingCount === "number" && Number.isFinite(place.userRatingCount)
    ? Math.max(0, Math.trunc(place.userRatingCount))
    : undefined
  return {
    id: `google-${place.id?.trim() || index}`,
    name,
    label: [name, address].filter(Boolean).join(", "),
    region: address,
    country: "",
    lat: latitude,
    lon: longitude,
    ...(place.primaryType?.trim() ? { kind: place.primaryType.trim() } : {}),
    ...(rating === undefined ? {} : { rating }),
    ...(reviewCount === undefined ? {} : { reviewCount }),
    types
  }
}

function distanceKilometers(from: GeocoderBias, to: GeocoderBias): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = toRadians(to.lat - from.lat)
  const longitudeDelta = toRadians(to.lon - from.lon)
  const fromLatitude = toRadians(from.lat)
  const toLatitude = toRadians(to.lat)
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function categoryFor(types: readonly string[]): RiderStopCategory {
  if (types.some((type) => SCENIC_TYPES.has(type))) return "scenic"
  if (types.some((type) => BREWERY_TYPES.has(type))) return "brewery"
  if (types.some((type) => COFFEE_TYPES.has(type))) return "coffee"
  if (types.some((type) => FUEL_TYPES.has(type))) return "fuel"
  if (types.some((type) => FOOD_TYPES.has(type))) return "food"
  return "food"
}

function reasonFor(category: RiderStopCategory, types: readonly string[]): string {
  if (category === "scenic") {
    if (types.includes("park") || types.includes("state_park") || types.includes("national_park")) {
      return "Park and overlook break"
    }
    return "Scenic motorcycle break"
  }
  if (category === "brewery") {
    return types.includes("brewery") || types.includes("brewpub")
      ? "Destination brewery"
      : "Local pub stop"
  }
  if (category === "coffee") return "Coffee and reset stop"
  if (category === "fuel") return "Fuel stop"
  return "Worthwhile meal stop"
}

function intentBonus(kind: FunStopKind, types: readonly string[], category: RiderStopCategory): number {
  if (kind === "brewery") {
    if (types.includes("brewery") || types.includes("brewpub")) return 58
    if (types.includes("beer_garden") || types.includes("pub")) return 44
    if (category === "scenic") return 42
    if (types.includes("bar")) return 24
  }
  if (kind === "coffee") {
    if (types.includes("coffee_shop") || types.includes("coffee_roastery") || types.includes("cafe")) return 56
    if (category === "scenic") return 40
    if (category === "brewery") return 20
  }
  if (kind === "food") {
    if (category === "food") return 52
    if (category === "brewery") return 38
    if (category === "scenic") return 36
  }
  if (kind === "fuel" && category === "fuel") return 60
  return 10
}

function riderFitScore(
  candidate: GooglePlaceCandidate,
  kind: FunStopKind,
  center: GeocoderBias,
  route: readonly GeocoderBias[],
  radiusKm: number
): { category: RiderStopCategory; score: number } {
  const category = categoryFor(candidate.types)
  const corridor = route.length > 0 ? route : [center]
  const routeDistance = Math.min(...corridor.map((point) => distanceKilometers(point, candidate)))
  const ratingScore = Math.max(0, Math.min(5, candidate.rating ?? 0)) * 8
  const reviewScore = Math.min(30, Math.log10((candidate.reviewCount ?? 0) + 1) * 8)
  const corridorScore = Math.max(0, 22 * (1 - routeDistance / Math.max(5, radiusKm)))
  return {
    category,
    score: intentBonus(kind, candidate.types, category) + ratingScore + reviewScore + corridorScore
  }
}

function selectDiverseRiderStops(
  candidates: GooglePlaceCandidate[],
  kind: FunStopKind,
  center: GeocoderBias,
  route: readonly GeocoderBias[],
  radiusKm: number
): PlaceResult[] {
  const ranked = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      ...riderFitScore(candidate, kind, center, route, radiusKm)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)

  const selected: typeof ranked = []
  const selectedCategories = new Set<RiderStopCategory>()
  for (const entry of ranked) {
    if (selectedCategories.has(entry.category)) continue
    selected.push(entry)
    selectedCategories.add(entry.category)
  }
  selected.push(...ranked.filter((entry) => !selected.includes(entry)))

  return selected.slice(0, 5).map(({ candidate, category }) => {
    const { types: _types, ...place } = candidate
    void _types
    return { ...place, riderReason: reasonFor(category, candidate.types) }
  })
}

export async function searchGooglePopularPlaces(options: GooglePlacesOptions): Promise<PlaceResult[]> {
  if (!options.apiKey?.trim() || !validCoordinate(options.center)) return []

  let response: Response
  try {
    response = await (options.fetcher ?? fetch)(GOOGLE_NEARBY_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": options.apiKey,
        "x-goog-fieldmask": GOOGLE_PLACE_FIELDS
      },
      body: JSON.stringify({
        includedTypes: RIDER_STOP_TYPES[options.kind],
        maxResultCount: 20,
        rankPreference: "POPULARITY",
        locationRestriction: {
          circle: {
            center: { latitude: options.center.lat, longitude: options.center.lon },
            radius: boundedRadiusMeters(options.radiusKm)
          }
        }
      }),
      signal: AbortSignal.timeout(8_000)
    })
  } catch {
    throw new GooglePlacesError("Google place ideas are temporarily unavailable.", "GOOGLE_PLACES_UNAVAILABLE", 503)
  }

  if (!response.ok) {
    throw new GooglePlacesError("Google place ideas are temporarily unavailable.", "GOOGLE_PLACES_UNAVAILABLE", response.status)
  }

  let payload: GooglePlacesResponse
  try {
    payload = await response.json() as GooglePlacesResponse
  } catch {
    throw new GooglePlacesError("Google place ideas returned an unreadable response.", "INVALID_GOOGLE_PLACES_RESPONSE", 502)
  }

  if (!Array.isArray(payload.places)) {
    throw new GooglePlacesError("Google place ideas returned an invalid response.", "INVALID_GOOGLE_PLACES_RESPONSE", 502)
  }

  const candidates = payload.places
    .map((place, index) => normalizePlace(place, index))
    .filter((place): place is GooglePlaceCandidate => place !== null)
  return selectDiverseRiderStops(
    candidates,
    options.kind,
    options.center,
    options.route ?? [],
    options.radiusKm ?? 35
  )
}

export async function searchGoogleTextPlaces(options: GoogleTextPlacesOptions): Promise<PlaceResult[]> {
  const query = options.query.trim()
  if (!options.apiKey?.trim() || query.length < 2) return []

  const locationBias = options.bias && validCoordinate(options.bias)
    ? {
        circle: {
          center: { latitude: options.bias.lat, longitude: options.bias.lon },
          radius: 50_000
        }
      }
    : undefined

  let response: Response
  try {
    response = await (options.fetcher ?? fetch)(GOOGLE_TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": options.apiKey,
        "x-goog-fieldmask": GOOGLE_PLACE_FIELDS
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: 8,
        languageCode: "en",
        regionCode: "US",
        ...(locationBias ? { locationBias } : {})
      }),
      signal: AbortSignal.timeout(8_000)
    })
  } catch {
    throw new GooglePlacesError("Google place search is temporarily unavailable.", "GOOGLE_PLACES_UNAVAILABLE", 503)
  }

  if (!response.ok) {
    throw new GooglePlacesError("Google place search is temporarily unavailable.", "GOOGLE_PLACES_UNAVAILABLE", response.status)
  }

  let payload: GooglePlacesResponse
  try {
    payload = await response.json() as GooglePlacesResponse
  } catch {
    throw new GooglePlacesError("Google place search returned an unreadable response.", "INVALID_GOOGLE_PLACES_RESPONSE", 502)
  }
  if (!Array.isArray(payload.places)) {
    throw new GooglePlacesError("Google place search returned an invalid response.", "INVALID_GOOGLE_PLACES_RESPONSE", 502)
  }

  return payload.places
    .map((place, index) => normalizePlace(place, index))
    .filter((place): place is GooglePlaceCandidate => place !== null)
    .map(({ types: _types, ...place }) => {
      void _types
      return place
    })
}
