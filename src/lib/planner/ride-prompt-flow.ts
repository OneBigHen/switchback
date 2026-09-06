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

async function resolvePlace(
  query: string,
  bias: GeocoderBias,
  search: RidePromptWaypointOptions["search"]
): Promise<Waypoint> {
  const places = await search(query, bias)
  // The provider has already ranked a textual query, including whatever
  // proximity bias it supports. Re-selecting the nearest result here can turn
  // an explicit "Austin" into a different Austin near the current route.
  // Trust the provider's top match and let routing report out-of-coverage
  // honestly instead of silently substituting another place.
  const place = places[0]
  if (!place) {
    throw new Error(`I understood the ride, but could not find “${query}”.`)
  }
  return asWaypoint(place)
}

/**
 * Resolve the geographic part of a free-form ride request independently from
 * React and planner-store mutations. Explicit origins win, fresh browsers ask
 * for location before destination search, and every search is biased from the
 * origin that will actually be routed. Provider ranking remains authoritative
 * so the bias cannot silently replace an explicit named place.
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
