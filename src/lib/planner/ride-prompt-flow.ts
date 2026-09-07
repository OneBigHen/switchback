import type { RideIntent } from "@/lib/ai/ride-intent"
import type { GeocoderBias, PlaceResult } from "@/lib/geocoding/photon"
import type { Waypoint } from "@/lib/routing/types"

const DEFAULT_SEARCH_BIAS: GeocoderBias = { lat: 40.2732, lon: -76.8867 }

export interface RidePromptWaypointOptions {
  intent: RideIntent
  start: Waypoint | null
  finish: Waypoint | null
  home?: Waypoint | null
  search: (query: string, bias: GeocoderBias) => Promise<PlaceResult[]>
  requestLocation: () => Promise<RideStartLocation>
  defaultBias?: GeocoderBias
}

/** Where an inferred start came from. */
export type RideStartLocationSource = "live" | "saved" | "home" | "region"

export interface RideStartLocation {
  waypoint: Waypoint
  source: RideStartLocationSource
}

export interface ResolvedRidePromptWaypoints {
  start: Waypoint
  finish: Waypoint | null
  /** How the start was obtained; null when the rider supplied an explicit start. */
  locationSource: RideStartLocationSource | null
}

function asBias(point: Waypoint | null, fallback: GeocoderBias): GeocoderBias {
  return point ? { lat: point.lat, lon: point.lon } : fallback
}

function asWaypoint(place: PlaceResult): Waypoint {
  return { lat: place.lat, lon: place.lon, label: place.label }
}

function isHomeQuery(query: string | null): boolean {
  return query != null && /^(?:my\s+)?home$/i.test(query.trim())
}

function resolveHome(home: Waypoint | null | undefined): Waypoint {
  if (!home) throw new Error("Save Home in the route editor before asking for directions home.")
  return { ...home, label: "Home" }
}

function normalizePlaceText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function queryExplicitlyScopesPlace(query: string, place: PlaceResult): boolean {
  if (query.includes(",")) return true
  const normalizedQuery = normalizePlaceText(query)
  const normalizedName = normalizePlaceText(place.name)
  if (!normalizedQuery || normalizedQuery === normalizedName) return false
  return [place.region, place.country]
    .map(normalizePlaceText)
    .filter(Boolean)
    .some((scope) => normalizedQuery.includes(scope))
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

function selectRidePromptPlace(
  query: string,
  places: PlaceResult[],
  bias: GeocoderBias
): PlaceResult | undefined {
  const providerWinner = places[0]
  if (!providerWinner) return undefined

  // A rider who names a scope ("Austin, Texas" / "Paris, France") gets that
  // provider-resolved place even when it is far from the current route. A bare
  // ambiguous name is different: resolve it around the origin that will
  // actually be routed instead of silently sending the rider to a distant
  // namesake just because the provider happened to rank that one first.
  if (queryExplicitlyScopesPlace(query, providerWinner)) return providerWinner

  return [...places].sort((left, right) =>
    distanceInKilometers(bias, left) - distanceInKilometers(bias, right)
  )[0]
}

async function resolvePlace(
  query: string,
  bias: GeocoderBias,
  search: RidePromptWaypointOptions["search"]
): Promise<Waypoint> {
  const places = await search(query, bias)
  const place = selectRidePromptPlace(query, places, bias)
  if (!place) {
    throw new Error(`I understood the ride, but could not find “${query}”.`)
  }
  return asWaypoint(place)
}

/**
 * Resolve the geographic part of a free-form ride request independently from
 * React and planner-store mutations. Explicit origins win, fresh browsers ask
 * for location before destination search, and every search is biased from the
 * origin that will actually be routed. Geographically qualified place names
 * remain authoritative while bare ambiguous names resolve around that origin.
 */
export async function resolveRidePromptWaypoints(
  options: RidePromptWaypointOptions
): Promise<ResolvedRidePromptWaypoints> {
  const { intent } = options
  if (intent.mode === "destination" && !intent.destinationQuery) {
    throw new Error("Tell me where you want to ride before I build an A-to-B route.")
  }

  const defaultBias = options.defaultBias ?? DEFAULT_SEARCH_BIAS
  let start = options.start
  let locationSource: RideStartLocationSource | null = null

  if (intent.startQuery) {
    start = isHomeQuery(intent.startQuery)
      ? resolveHome(options.home)
      : await resolvePlace(intent.startQuery, asBias(start, defaultBias), options.search)
  }
  if (!start) {
    const resolved = await options.requestLocation()
    start = resolved.waypoint
    locationSource = resolved.source
  }

  let finish = options.finish
  if (intent.mode === "destination" && intent.destinationQuery) {
    finish = isHomeQuery(intent.destinationQuery)
      ? resolveHome(options.home)
      : await resolvePlace(intent.destinationQuery, asBias(start, defaultBias), options.search)
  }

  return { start, finish, locationSource }
}
