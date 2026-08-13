import type { Coordinate, PlannedRoute, RouteProfileId, RouteInstruction, RouteRequest } from "./types"
import { normalizeRouteRequest, type NormalizedRouteRequest } from "@/lib/domain/routing/normalized-request"
import { getProfile } from "./profiles"
import { analyzeGeometry } from "./scoring"
import { featureProvenanceForPlannedRoute, scorePlannedRoute } from "@/lib/recommendation/route-candidate"

export interface ValhallaOptions {
  baseUrl: string
  fetcher?: typeof fetch
  /** Lifecycle cancellation signal, combined with the request timeout. */
  signal?: AbortSignal
}

export interface ValhallaResult {
  engine: "valhalla"
  engineVersion: string
  routes: PlannedRoute[]
}

export class ValhallaProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
  }
}

/** AbortError travels across runtimes/realms, so check the name, not the class. */
function isAbortError(caught: unknown): boolean {
  return caught !== null && typeof caught === "object"
    && (caught as { name?: unknown }).name === "AbortError"
}

const PROFILE_COSTING_OPTIONS: Record<RouteProfileId, Record<string, number>> = {
  quick: { use_highways: 0.8 },
  balanced: { use_highways: 0.55 },
  twisty: { use_highways: 0.1 },
  scenic: { use_highways: 0.2 },
  adventure: {
    use_highways: 0.1,
    use_tracks: 0.8,
    use_trails: 0.8,
    use_living_streets: 0.5
  },
  gravel: {
    use_highways: 0.1,
    use_tracks: 0.9,
    use_trails: 0.9,
    use_living_streets: 0.5
  },
  "avoid-highways": { use_highways: 0 },
  neural: { use_highways: 0.15 }
}

export function createValhallaRequest(_input: RouteRequest): Record<string, unknown> {
  const request = normalizeRouteRequest(_input)
  const profile = getProfile(request.profile)
  if (request.roundTrip) {
    throw new ValhallaProviderError(
      "Valhalla does not support native round trips; generate shaping waypoints before routing.",
      "UNSUPPORTED_REQUEST",
      422
    )
  }
  if (request.points.length < 2) {
    throw new ValhallaProviderError(
      "Valhalla requires at least two waypoints.",
      "INVALID_ROUTE_REQUEST",
      400
    )
  }

  const locations = request.points.map((point, index) => ({
    lat: point.lat,
    lon: point.lon,
    type: index === 0 || index === request.points.length - 1 ? "break" : "through",
    ...(point.label ? { name: point.label } : {})
  }))

  const costingOptions: Record<string, number> = { ...PROFILE_COSTING_OPTIONS[profile.id] }

  if (request.avoidHighways || request.profile === "avoid-highways") {
    costingOptions.use_highways = 0
  }

  const excludePolygons = (request.avoidAreas ?? []).map((area) => {
    const polygon = area.polygon.map(([longitude, latitude]) => [longitude, latitude] as Coordinate)
    const first = polygon[0]
    const last = polygon.at(-1)
    if (first && (!last || first[0] !== last[0] || first[1] !== last[1])) {
      polygon.push([...first] as Coordinate)
    }
    return polygon
  })

  return {
    costing: "motorcycle",
    costing_options: { motorcycle: costingOptions },
    locations,
    units: "miles",
    directions_type: "instructions",
    format: "json",
    alternates: request.points.length === 2 ? 2 : 0,
    ...(excludePolygons.length > 0 ? { exclude_polygons: excludePolygons } : {})
  }
}

interface ValhallaManeuver {
  type?: number
  instruction?: string
  street_names?: string[]
  length?: number
  time?: number
  begin_shape_index?: number
  end_shape_index?: number
  rough?: boolean
}

interface ValhallaLeg {
  shape?: string
  summary?: { length?: number; time?: number; has_time_restrictions?: boolean; ascent?: number; descent?: number }
  maneuvers?: ValhallaManeuver[]
}

interface ValhallaTrip {
  summary?: { length?: number; time?: number; ascent?: number; descent?: number }
  status?: number
  status_message?: string
  legs?: ValhallaLeg[]
  units?: string
  locations?: ValhallaLocation[]
}

interface ValhallaLocation {
  lat?: number
  lon?: number
  original_index?: number
}

interface ValhallaResponse {
  error?: string
  error_code?: number
  trip?: ValhallaTrip
  alternates?: { trip?: ValhallaTrip }[]
}

const MANEUVER_TYPE_TO_SIGN: Record<number, number> = {
  0: 0,
  1: 0,
  2: 0,
  3: 0,
  4: 5,
  5: 5,
  6: 5,
  7: 0,
  8: 0,
  9: 7,
  10: 8,
  11: 98,
  12: 8,
  13: -8,
  14: -98,
  15: -8,
  16: -7,
  17: 0,
  18: 8,
  19: -8,
  20: 8,
  21: -8,
  22: 0,
  23: 3,
  24: -3,
  25: 0,
  26: 6,
  27: 6,
  28: 0,
  29: 0,
  30: 0,
  31: 0,
  32: 0,
  33: 0,
  34: 0,
  35: 0,
  36: 0,
  37: 2,
  38: -2,
  39: 0,
  40: 0,
  41: 0,
  42: 0,
  43: 0
}

function decodePolyline6(encoded: string): Coordinate[] {
  const coordinates: Coordinate[] = []
  let index = 0
  let lat = 0
  let lon = 0

  while (index < encoded.length) {
    let byte: number
    let shift = 0
    let result = 0

    do {
      byte = encoded.charCodeAt(index) - 63
      index++
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    const dLat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dLat

    shift = 0
    result = 0

    do {
      byte = encoded.charCodeAt(index) - 63
      index++
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    const dLon = result & 1 ? ~(result >> 1) : result >> 1
    lon += dLon

    coordinates.push([lon * 1e-6, lat * 1e-6])
  }

  return coordinates
}

interface ValhallaHeightResponse {
  shape?: { lat: number; lon: number }[]
  range_height?: [number, number | null][]
  height?: number[]
  error?: string
}

function sampleGeometryForHeight(geometry: Coordinate[], maxPoints = 200): { lat: number; lon: number }[] {
  if (geometry.length <= maxPoints) {
    return geometry.map(([lon, lat]) => ({ lat, lon }))
  }
  const step = Math.floor(geometry.length / maxPoints)
  const samples: { lat: number; lon: number }[] = []
  for (let i = 0; i < geometry.length; i += step) {
    samples.push({ lat: geometry[i][1], lon: geometry[i][0] })
  }
  const last = geometry[geometry.length - 1]
  samples.push({ lat: last[1], lon: last[0] })
  return samples
}

export async function fetchRouteElevations(
  geometry: Coordinate[],
  baseUrl: string,
  fetcher: typeof fetch,
  signal?: AbortSignal
): Promise<{ ascentMeters: number | null; descentMeters: number | null }> {
  const samples = sampleGeometryForHeight(geometry)
  let response: Response
  try {
    response = await fetcher(`${baseUrl.replace(/\/$/, "")}/height`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shape: samples, range: true }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000)
    })
  } catch {
    return { ascentMeters: null, descentMeters: null }
  }

  if (!response.ok) return { ascentMeters: null, descentMeters: null }

  let payload: ValhallaHeightResponse
  try {
    payload = (await response.json()) as ValhallaHeightResponse
  } catch {
    return { ascentMeters: null, descentMeters: null }
  }

  const heights: (number | null)[] = payload.range_height
    ? payload.range_height.map(([, h]) => h)
    : payload.height ?? []

  if (heights.length < 2 || heights.some((h) => h === null)) {
    return { ascentMeters: null, descentMeters: null }
  }

  let ascent = 0
  let descent = 0
  for (let i = 1; i < heights.length; i++) {
    const prev = heights[i - 1]!
    const curr = heights[i]!
    const delta = curr - prev
    if (delta > 0) ascent += delta
    else descent += Math.abs(delta)
  }

  return {
    ascentMeters: Math.round(ascent),
    descentMeters: Math.round(descent)
  }
}

function providerError(status: number, message: string, providerCode?: number): ValhallaProviderError {
  const detail = providerCode === undefined
    ? message
    : `Valhalla error ${providerCode}: ${message}`
  const normalized = detail.toLowerCase()
  if (
    normalized.includes("cannot reach") ||
    normalized.includes("out of") ||
    normalized.includes("not found") ||
    normalized.includes("no suitable edges") ||
    normalized.includes("outside")
  ) {
    return new ValhallaProviderError(
      `One or more waypoints are outside the installed routing region. ${detail}`,
      "OUT_OF_COVERAGE",
      status
    )
  }
  if (status >= 500) {
    return new ValhallaProviderError(
      `The routing engine is unavailable. ${detail}`,
      "PROVIDER_UNAVAILABLE",
      status
    )
  }
  return new ValhallaProviderError(
    `The routing engine rejected this trip. ${detail}`,
    "ROUTING_REJECTED",
    status
  )
}

type ValhallaUnits = "miles" | "kilometers"

function normalizeUnits(units: string | undefined): ValhallaUnits {
  if (units === undefined || units === "kilometers" || units === "km") return "kilometers"
  if (units === "miles" || units === "mi") return "miles"
  throw new ValhallaProviderError(
    `Valhalla returned unsupported distance units: ${units}`,
    "INVALID_PROVIDER_RESPONSE",
    502
  )
}

function distanceToMeters(distance: number, units: ValhallaUnits): number {
  return distance * (units === "miles" ? 1609.344 : 1000)
}

function distanceToMiles(distance: number, units: ValhallaUnits): number {
  return units === "miles" ? distance : distance / 1.609344
}

function normalizeManeuvers(
  maneuvers: ValhallaManeuver[],
  units: ValhallaUnits,
  shapeIndexOffset: number
): RouteInstruction[] {
  return maneuvers.map((maneuver) => {
    const sign = MANEUVER_TYPE_TO_SIGN[maneuver.type ?? 0] ?? 0
    const streetName = maneuver.street_names?.[0] ?? ""
    const beginIdx = (maneuver.begin_shape_index ?? 0) + shapeIndexOffset
    const endIdx = (maneuver.end_shape_index ?? maneuver.begin_shape_index ?? 0) + shapeIndexOffset

    return {
      distanceMeters: distanceToMeters(maneuver.length ?? 0, units),
      timeMilliseconds: (maneuver.time ?? 0) * 1000,
      sign,
      text: maneuver.instruction ?? (streetName ? `Continue on ${streetName}` : "Continue"),
      streetName,
      interval: [beginIdx, endIdx] as [number, number]
    }
  })
}

export function createRouteIdValhalla(
  profile: RouteProfileId,
  geometry: Coordinate[],
  index: number
): string {
  const fingerprint = geometry
    .slice(0, Math.min(geometry.length, 200))
    .map(([longitude, latitude]) => `${longitude.toFixed(6)},${latitude.toFixed(6)}`)
    .join(";")
  let hash = 2166136261
  for (let cursor = 0; cursor < fingerprint.length; cursor += 1) {
    hash ^= fingerprint.charCodeAt(cursor)
    hash = Math.imul(hash, 16777619)
  }
  return `valhalla-${profile}-${index + 1}-${(hash >>> 0).toString(36)}`
}

function sameCoordinate(first: Coordinate | undefined, second: Coordinate | undefined): boolean {
  return Boolean(
    first &&
    second &&
    Math.abs(first[0] - second[0]) <= 1e-6 &&
    Math.abs(first[1] - second[1]) <= 1e-6
  )
}

function normalizeTrip(
  trip: ValhallaTrip,
  request: NormalizedRouteRequest,
  index: number
): PlannedRoute {
  if (!trip.legs?.length) {
    throw new ValhallaProviderError(
      "Valhalla returned no route legs",
      "INVALID_PROVIDER_RESPONSE",
      502
    )
  }

  const units = normalizeUnits(trip.units)
  const geometry: Coordinate[] = []
  const instructions: RouteInstruction[] = []

  for (const leg of trip.legs) {
    if (!leg.shape) {
      throw new ValhallaProviderError(
        "Valhalla returned no geometry for a route leg",
        "INVALID_PROVIDER_RESPONSE",
        502
      )
    }
    const legGeometry = decodePolyline6(leg.shape)
    if (legGeometry.length < 2) {
      throw new ValhallaProviderError(
        "Valhalla returned no routable road geometry",
        "INVALID_PROVIDER_RESPONSE",
        502
      )
    }

    const sharedJoin = sameCoordinate(geometry.at(-1), legGeometry[0])
    const shapeIndexOffset = sharedJoin ? geometry.length - 1 : geometry.length
    geometry.push(...(sharedJoin ? legGeometry.slice(1) : legGeometry))
    instructions.push(...normalizeManeuvers(
      leg.maneuvers ?? [],
      units,
      shapeIndexOffset
    ))
  }

  if (geometry.length < 2) {
    throw new ValhallaProviderError(
      "Valhalla returned no routable road geometry",
      "INVALID_PROVIDER_RESPONSE",
      502
    )
  }

  if (instructions.length > 0) {
    instructions[instructions.length - 1] = {
      ...instructions[instructions.length - 1],
      sign: 4
    }
  }

  const analysis = analyzeGeometry(geometry)
  const profile = getProfile(request.profile)
  const waypoints = trip.locations?.length
    ? trip.locations.map((location, locationIndex) => {
        const originalIndex = location.original_index ?? locationIndex
        const requested = request.points[originalIndex] ?? request.points[locationIndex]
        return {
          lat: Number.isFinite(location.lat) ? location.lat! : requested?.lat ?? 0,
          lon: Number.isFinite(location.lon) ? location.lon! : requested?.lon ?? 0,
          label: requested?.label
        }
      })
    : request.points.map((point) => ({
        lat: point.lat,
        lon: point.lon,
        label: point.label
      }))

  const totalLength = trip.summary?.length ?? trip.legs.reduce(
    (sum, leg) => sum + (leg.summary?.length ?? 0),
    0
  )
  const totalTime = trip.summary?.time ?? trip.legs.reduce(
    (sum, leg) => sum + (leg.summary?.time ?? 0),
    0
  )
  const rawAscent = trip.summary?.ascent ?? trip.legs.reduce<number | null>((sum, leg) => {
    if (leg.summary?.ascent === undefined) return sum
    return (sum ?? 0) + leg.summary.ascent
  }, null)
  const rawDescent = trip.summary?.descent ?? trip.legs.reduce<number | null>((sum, leg) => {
    if (leg.summary?.descent === undefined) return sum
    return (sum ?? 0) + leg.summary.descent
  }, null)
  const elevationMultiplier = units === "miles" ? 0.3048 : 1

  const normalized: PlannedRoute = {
    id: createRouteIdValhalla(request.profile, geometry, index),
    name: index === 0 ? `${profile.label} route` : `${profile.label} alternative ${index + 1}`,
    profile: request.profile,
    geometry,
    waypoints,
    instructions,
    distanceMiles: Number(distanceToMiles(totalLength, units).toFixed(2)),
    durationMinutes: Number((totalTime / 60).toFixed(2)),
    ascentMeters: rawAscent === null ? null : Math.round(rawAscent * elevationMultiplier),
    descentMeters: rawDescent === null ? null : Math.round(rawDescent * elevationMultiplier),
    twistiness: analysis.twistiness,
    turnCount: analysis.turnCount,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false,
    candidateSource: request.points.length === 2
      ? index === 0 ? "direct" : "native"
      : undefined,
    loopTargetMinutes: request.loopTargetMinutes,
    avoidHighways: request.avoidHighways,
    avoidAreas: request.avoidAreas?.map((area) => ({ ...area, polygon: [...area.polygon] })),
    segmentProfiles: request.segmentProfiles ? [...request.segmentProfiles] : undefined
  }
  normalized.featureProvenance = featureProvenanceForPlannedRoute(normalized)
  return {
    ...normalized,
    routeScore: scorePlannedRoute(normalized, {
      profile: request.profile,
      bikeProfile: request.bikeProfile
    })
  }
}

function normalizeTrips(response: ValhallaResponse, request: NormalizedRouteRequest): PlannedRoute[] {
  if (!response.trip?.legs?.length) {
    throw providerError(422, response.trip?.status_message ?? "No route was found")
  }

  const trips = [
    response.trip,
    ...(response.alternates ?? []).flatMap((alternative) => alternative.trip ? [alternative.trip] : [])
  ]

  return trips.map((trip, index) => normalizeTrip(trip, request, index))
}

export async function requestValhallaRoutes(
  _input: RouteRequest,
  options: ValhallaOptions
): Promise<ValhallaResult> {
  const request = normalizeRouteRequest(_input)
  const fetcher = options.fetcher ?? fetch
  const requestBody = createValhallaRequest(request)
  let response: Response
  try {
    response = await fetcher(`${options.baseUrl.replace(/\/$/, "")}/route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000)
    })
  } catch (caught) {
    if (isAbortError(caught)) {
      throw new ValhallaProviderError(
        "Route planning was cancelled.",
        "ROUTE_CANCELLED",
        499
      )
    }
    throw new ValhallaProviderError(
      "Cannot reach the Valhalla routing engine. Check that the container is running.",
      "PROVIDER_UNAVAILABLE",
      503
    )
  }

  let payload: ValhallaResponse
  try {
    payload = (await response.json()) as ValhallaResponse
  } catch {
    throw new ValhallaProviderError(
      "Valhalla returned an unreadable response",
      "INVALID_PROVIDER_RESPONSE",
      502
    )
  }

  if (!response.ok || payload.error) {
    throw providerError(
      response.status,
      payload.error ?? payload.trip?.status_message ?? response.statusText,
      payload.error_code
    )
  }

  return {
    engine: "valhalla",
    engineVersion: "3.x",
    routes: normalizeTrips(payload, request)
  }
}

export async function enrichWithElevations<T extends { routes: PlannedRoute[] }>(
  result: T,
  options: ValhallaOptions
): Promise<T> {
  const fetcher = options.fetcher ?? fetch
  const enriched = await Promise.all(
    result.routes.map(async (route) => {
      const elevations = await fetchRouteElevations(route.geometry, options.baseUrl, fetcher, options.signal)
      return { ...route, ...elevations }
    })
  )
  return { ...result, routes: enriched }
}
