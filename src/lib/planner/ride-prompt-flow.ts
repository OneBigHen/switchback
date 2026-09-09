import type { RideIntent } from "@/lib/ai/ride-intent"
import type { GeocoderBias, PlaceResult } from "@/lib/geocoding/photon"
import type { Waypoint } from "@/lib/routing/types"

const DEFAULT_SEARCH_BIAS: GeocoderBias = { lat: 40.2732, lon: -76.8867 }

/**
 * Photon exposes OSM feature kinds. These are geographic identities a rider
 * can reasonably mean when they type a bare place name; an amenity or road
 * sharing the same name must not outrank them merely because it is closer.
 */
const LOCALITY_KINDS = new Set([
  "city",
  "town",
  "village",
  "hamlet",
  "borough",
  "municipality",
  "administrative",
  "suburb",
  "neighbourhood",
  "neighborhood"
])

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

function normalizePlaceKind(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? ""
}

function isSpecificAddressQuery(query: string): boolean {
  // A house number is stronger identity than a locality heuristic, but a
  // number anywhere in the query also matches named highways such as "PA 32"
  // and "Route 611". Only an address-shaped leading number gets provider
  // winner treatment; semantic road/place ranking remains active otherwise.
  const match = query.trim().match(/^\d+[a-z]?\s+(.+)$/i)
  return Boolean(match && /[a-z]/i.test(match[1]))
}

function placeIdentityScore(query: string, place: PlaceResult): number {
  const normalizedQuery = normalizePlaceText(query)
  const requestedHead = normalizePlaceText(query.split(",", 1)[0] ?? query)
  const normalizedName = normalizePlaceText(place.name)
  const normalizedLabelHead = normalizePlaceText(place.label.split(",", 1)[0] ?? place.label)
  const identities = new Set([normalizedName, normalizedLabelHead].filter(Boolean))

  if (identities.has(requestedHead)) return 2
  // Also recognize natural scoped input without a comma, e.g. "Austin Texas"
  // or "Springfield MA". The candidate name consumes the identity prefix and
  // the remaining tokens are scope, not part of the place name.
  if ([...identities].some((identity) =>
    normalizedQuery === identity || normalizedQuery.startsWith(`${identity} `)
  )) return 1
  return 0
}

function localityScore(place: PlaceResult): number {
  return LOCALITY_KINDS.has(normalizePlaceKind(place.kind)) ? 1 : 0
}

function queryScopeParts(query: string, place: PlaceResult): string[] {
  if (query.includes(",")) {
    return query
      .split(",")
      .slice(1)
      .map(normalizePlaceText)
      .filter(Boolean)
  }
  const normalizedQuery = normalizePlaceText(query)
  const normalizedName = normalizePlaceText(place.name)
  if (!normalizedName || !normalizedQuery.startsWith(`${normalizedName} `)) return []
  return [normalizedQuery.slice(normalizedName.length).trim()]
}

function scopeAliases(value: string): Set<string> {
  const normalized = normalizePlaceText(value)
  if (!normalized) return new Set()
  const words = normalized.split(" ").filter(Boolean)
  return new Set([
    normalized,
    words.join(""),
    ...(words.length > 1 ? [words.map((word) => word[0]).join("")] : [])
  ])
}

function placeScopeMatches(query: string, place: PlaceResult): boolean {
  const scopeParts = queryScopeParts(query, place)
  if (scopeParts.length === 0) return false

  const evidence = [place.region, place.country, ...place.label.split(",")]
    .flatMap((value) => [...scopeAliases(value)])
  return scopeParts.every((part) => evidence.includes(part))
}

function queryHasExplicitScope(query: string, places: PlaceResult[]): boolean {
  return places.some((place) => queryScopeParts(query, place).length > 0)
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
  if (isSpecificAddressQuery(query)) return providerWinner
  const hasExplicitScope = queryHasExplicitScope(query, places)

  let ranked = places.map((place, index) => ({
    place,
    index,
    identity: placeIdentityScore(query, place),
    locality: localityScore(place),
    distanceKm: distanceInKilometers(bias, place)
  }))

  // An explicit region/country is semantic evidence only when the candidate
  // itself supports every requested scope part. Contradictory same-name
  // candidates are excluded before proximity and provider order can decide.
  if (hasExplicitScope) {
    ranked = ranked.filter((candidate) => placeScopeMatches(query, candidate.place))
    if (ranked.length === 0) return undefined
  }

  const bestIdentity = Math.max(...ranked.map((candidate) => candidate.identity))

  // If none of the provider results actually preserves the rider's named
  // identity, do not invent confidence by choosing whichever unrelated feature
  // happens to be closest. The provider's textual ranking is the least lossy
  // fallback and downstream routing can still reject unsupported coverage.
  if (bestIdentity === 0) {
    return hasExplicitScope ? undefined : providerWinner
  }

  const identityMatches = ranked.filter((candidate) => candidate.identity === bestIdentity)
  const bestLocality = Math.max(...identityMatches.map((candidate) => candidate.locality))
  const semanticPeers = identityMatches.filter((candidate) => candidate.locality === bestLocality)

  // Explicit scope ("New Hope, PA" / "Austin Texas") is semantic evidence.
  // Preserve provider ordering among otherwise equivalent candidates so a
  // locality qualifier is never overwritten by origin proximity. Bare
  // ambiguous names use proximity only after identity and entity kind tie.
  if (hasExplicitScope) {
    return semanticPeers.sort((left, right) => left.index - right.index)[0]!.place
  }

  return semanticPeers.sort((left, right) =>
    left.distanceKm - right.distanceKm || left.index - right.index
  )[0]!.place
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
 * origin that will actually be routed. Semantic place identity outranks
 * proximity; proximity only breaks ties between equivalent bare-name matches.
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
