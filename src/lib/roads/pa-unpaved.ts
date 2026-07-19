import type {
  GeoJsonPosition,
  PaUnpavedRoadFeature,
  PaUnpavedRoadFeatureCollection,
  PaUnpavedRoadGeometry,
  PaUnpavedRoadCorridorQuery,
  PaUnpavedRoadQuery
} from "./types"

export const PA_UNPAVED_ROADS_QUERY_URL =
  "https://mapservices.pasda.psu.edu/server/rest/services/pasda/DEP/MapServer/33/query"
export const PA_UNPAVED_ROADS_MAX_FEATURES = 500
export const PA_UNPAVED_ROADS_TIMEOUT_MS = 8_000
export const PA_UNPAVED_ROADS_CORRIDOR_TIMEOUT_MS = 1_500
export const PA_UNPAVED_ROADS_MAX_CORRIDOR_POINTS = 200

const PA_UNPAVED_ROADS_MAX_INPUT_POINTS = 20_000
const CORRIDOR_SIMPLIFICATION_TOLERANCE_METERS = 12
const EARTH_RADIUS_METERS = 6_371_000
const CORRIDOR_CACHE_TTL_MS = 6 * 60 * 60 * 1_000
const CORRIDOR_CACHE_MAX_ENTRIES = 128

const MAX_LATITUDE_SPAN = 2
const MAX_LONGITUDE_SPAN = 3
const SOURCE = "Pennsylvania Department of Environmental Protection" as const
const DATASET = "Unpaved Roads 2009_07" as const
const UNAVAILABLE_MESSAGE =
  "Official Pennsylvania unpaved-road data is temporarily unavailable."

interface CorridorCacheEntry {
  expiresAt: number
  promise: Promise<PaUnpavedRoadFeatureCollection>
}

const corridorCache = new Map<string, CorridorCacheEntry>()

export interface PaUnpavedRoadProviderOptions {
  fetcher?: typeof fetch
  timeoutMs?: number
  cache?: boolean
}

export class PaUnpavedRoadProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message)
    this.name = "PaUnpavedRoadProviderError"
  }
}

export async function fetchPaUnpavedRoadsNearRoutes(
  query: PaUnpavedRoadCorridorQuery,
  options: PaUnpavedRoadProviderOptions = {}
): Promise<PaUnpavedRoadFeatureCollection> {
  const paths = normalizeCorridorPaths(query.paths)
  if (
    (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1)) ||
    (query.bufferMeters !== undefined &&
      (!Number.isFinite(query.bufferMeters) || query.bufferMeters <= 0))
  ) {
    throw invalidCorridorError()
  }
  const limit = Math.min(
    Math.max(1, Math.trunc(query.limit ?? PA_UNPAVED_ROADS_MAX_FEATURES)),
    PA_UNPAVED_ROADS_MAX_FEATURES
  )
  const bufferMeters = Math.min(100, Math.max(10, query.bufferMeters ?? 50))
  const body = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    geometry: JSON.stringify({ paths, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPolyline",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    outSR: "4326",
    distance: String(bufferMeters),
    units: "esriSRUnit_Meter",
    outFields: "OBJECTID,LENGTH,COUNTY",
    returnGeometry: "true",
    orderByFields: "OBJECTID ASC",
    resultRecordCount: String(limit)
  })
  const cacheEnabled = options.cache ?? options.fetcher === undefined
  const cacheKey = JSON.stringify({ paths, bufferMeters, limit })
  if (cacheEnabled) {
    const cached = corridorCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      corridorCache.delete(cacheKey)
      corridorCache.set(cacheKey, cached)
      return cached.promise
    }
    if (cached) corridorCache.delete(cacheKey)
  }

  const pending = requestCorridorFeatureCollection(body, limit, options)
  if (cacheEnabled) {
    corridorCache.set(cacheKey, {
      expiresAt: Date.now() + CORRIDOR_CACHE_TTL_MS,
      promise: pending
    })
    trimCorridorCache()
  }

  try {
    const collection = await pending
    if (
      cacheEnabled &&
      collection.metadata?.truncated === true &&
      corridorCache.get(cacheKey)?.promise === pending
    ) {
      corridorCache.delete(cacheKey)
    }
    return collection
  } catch (error) {
    if (cacheEnabled && corridorCache.get(cacheKey)?.promise === pending) {
      corridorCache.delete(cacheKey)
    }
    throw error
  }
}

async function requestCorridorFeatureCollection(
  body: URLSearchParams,
  limit: number,
  options: PaUnpavedRoadProviderOptions
): Promise<PaUnpavedRoadFeatureCollection> {
  const controller = new AbortController()
  const timeoutMs = Math.max(
    1,
    Math.min(options.timeoutMs ?? PA_UNPAVED_ROADS_CORRIDOR_TIMEOUT_MS, 15_000)
  )
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let payload: ArcGisGeoJsonResponse
  try {
    const response = await (options.fetcher ?? fetch)(PA_UNPAVED_ROADS_QUERY_URL, {
      method: "POST",
      headers: {
        accept: "application/geo+json, application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body,
      signal: controller.signal
    })
    if (!response.ok) throw unavailableError()
    const value: unknown = await response.json()
    if (
      !isRecord(value) ||
      value.type !== "FeatureCollection" ||
      !Array.isArray(value.features) ||
      "error" in value
    ) {
      throw unavailableError()
    }
    payload = value as ArcGisGeoJsonResponse
  } catch (error) {
    if (error instanceof PaUnpavedRoadProviderError) throw error
    throw unavailableError()
  } finally {
    clearTimeout(timeout)
  }

  return normalizeFeatureCollection(payload, limit)
}

function trimCorridorCache(): void {
  while (corridorCache.size > CORRIDOR_CACHE_MAX_ENTRIES) {
    const oldestKey = corridorCache.keys().next().value
    if (oldestKey === undefined) return
    corridorCache.delete(oldestKey)
  }
}

export async function fetchPaUnpavedRoads(
  query: PaUnpavedRoadQuery,
  options: PaUnpavedRoadProviderOptions = {}
): Promise<PaUnpavedRoadFeatureCollection> {
  const normalizedQuery = normalizePaUnpavedRoadQuery(query)
  const limit = normalizedQuery.limit
  const url = new URL(PA_UNPAVED_ROADS_QUERY_URL)
  const { south, west, north, east } = normalizedQuery.bounds
  url.searchParams.set("f", "geojson")
  url.searchParams.set("where", "1=1")
  url.searchParams.set("geometry", `${west},${south},${east},${north}`)
  url.searchParams.set("geometryType", "esriGeometryEnvelope")
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects")
  url.searchParams.set("inSR", "4326")
  url.searchParams.set("outSR", "4326")
  url.searchParams.set("outFields", "OBJECTID,LENGTH,COUNTY")
  url.searchParams.set("returnGeometry", "true")
  url.searchParams.set("orderByFields", "OBJECTID ASC")
  url.searchParams.set("resultRecordCount", String(limit))

  const controller = new AbortController()
  const timeoutMs = Math.max(
    1,
    Math.min(options.timeoutMs ?? PA_UNPAVED_ROADS_TIMEOUT_MS, 15_000)
  )
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let payload: ArcGisGeoJsonResponse
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      headers: { accept: "application/geo+json, application/json" },
      signal: controller.signal
    })
    if (!response.ok) throw unavailableError()

    const value: unknown = await response.json()
    if (
      !isRecord(value) ||
      value.type !== "FeatureCollection" ||
      !Array.isArray(value.features) ||
      "error" in value
    ) {
      throw unavailableError()
    }
    payload = value as ArcGisGeoJsonResponse
  } catch (error) {
    if (error instanceof PaUnpavedRoadProviderError) throw error
    throw unavailableError()
  } finally {
    clearTimeout(timeout)
  }

  return normalizeFeatureCollection(payload, limit)
}

function normalizeFeatureCollection(
  payload: ArcGisGeoJsonResponse,
  limit: number
): PaUnpavedRoadFeatureCollection {
  const rawFeatures = Array.isArray(payload.features) ? payload.features : []
  const features = rawFeatures.flatMap(normalizeFeature).slice(0, limit)
  return {
    type: "FeatureCollection",
    features,
    metadata: {
      count: features.length,
      limit,
      truncated:
        payload.exceededTransferLimit === true ||
        payload.properties?.exceededTransferLimit === true ||
        rawFeatures.length > limit,
      source: SOURCE,
      dataset: DATASET
    }
  }
}

function normalizeCorridorPaths(paths: GeoJsonPosition[][]): GeoJsonPosition[][] {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 4) {
    throw invalidCorridorError()
  }
  const normalized = paths.map((path) => {
    if (!Array.isArray(path) || path.length > PA_UNPAVED_ROADS_MAX_INPUT_POINTS) return null
    const line = normalizeLine(path)
    return line === null ? null : simplifyCorridorPath(line)
  })
  if (normalized.some((path) => path === null)) throw invalidCorridorError()
  return normalized as GeoJsonPosition[][]
}

function simplifyCorridorPath(path: GeoJsonPosition[]): GeoJsonPosition[] {
  if (path.length <= 2) return path
  const referenceLatitude = path.reduce((sum, coordinate) => sum + coordinate[1], 0) /
    path.length
  const projected = path.map((coordinate) => projectCoordinate(coordinate, referenceLatitude))
  const retained = new Set([0, path.length - 1])
  const pendingRanges: Array<[number, number]> = [[0, path.length - 1]]
  while (pendingRanges.length > 0) {
    const [from, to] = pendingRanges.pop() as [number, number]
    if (to - from <= 1) continue
    let farthestIndex = -1
    let farthestDistance = -1
    for (let index = from + 1; index < to; index += 1) {
      const distance = pointToSegmentDistance(
        projected[index],
        projected[from],
        projected[to]
      )
      if (distance > farthestDistance) {
        farthestDistance = distance
        farthestIndex = index
      }
    }
    if (farthestDistance <= CORRIDOR_SIMPLIFICATION_TOLERANCE_METERS) continue
    retained.add(farthestIndex)
    pendingRanges.push([from, farthestIndex], [farthestIndex, to])
  }
  const simplified = [...retained]
    .sort((left, right) => left - right)
    .map((index) => path[index])
  if (simplified.length <= PA_UNPAVED_ROADS_MAX_CORRIDOR_POINTS) return simplified

  return Array.from({ length: PA_UNPAVED_ROADS_MAX_CORRIDOR_POINTS }, (_, index) => {
    const sourceIndex = Math.round(
      index * (simplified.length - 1) /
      (PA_UNPAVED_ROADS_MAX_CORRIDOR_POINTS - 1)
    )
    return simplified[sourceIndex]
  })
}

function projectCoordinate(
  [longitude, latitude]: GeoJsonPosition,
  referenceLatitude: number
): GeoJsonPosition {
  const radians = Math.PI / 180
  return [
    EARTH_RADIUS_METERS * longitude * radians * Math.cos(referenceLatitude * radians),
    EARTH_RADIUS_METERS * latitude * radians
  ]
}

function pointToSegmentDistance(
  point: GeoJsonPosition,
  start: GeoJsonPosition,
  end: GeoJsonPosition
): number {
  const deltaX = end[0] - start[0]
  const deltaY = end[1] - start[1]
  const squaredLength = deltaX * deltaX + deltaY * deltaY
  const ratio = squaredLength === 0
    ? 0
    : Math.max(0, Math.min(
        1,
        ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) /
          squaredLength
      ))
  return Math.hypot(
    point[0] - (start[0] + ratio * deltaX),
    point[1] - (start[1] + ratio * deltaY)
  )
}

function invalidCorridorError(): PaUnpavedRoadProviderError {
  return new PaUnpavedRoadProviderError(
    "Use one to four valid route geometries.",
    "INVALID_PA_UNPAVED_ROAD_CORRIDOR",
    400
  )
}

function unavailableError(): PaUnpavedRoadProviderError {
  return new PaUnpavedRoadProviderError(
    UNAVAILABLE_MESSAGE,
    "PA_UNPAVED_ROADS_UNAVAILABLE",
    503
  )
}

export function normalizePaUnpavedRoadQuery(
  query: PaUnpavedRoadQuery
): PaUnpavedRoadQuery {
  const { south, west, north, east } = query.bounds
  const validCoordinates =
    [south, west, north, east].every(Number.isFinite) &&
    south >= -90 && north <= 90 &&
    west >= -180 && east <= 180
  const validEnvelope = south < north && west < east
  const boundedEnvelope =
    north - south <= MAX_LATITUDE_SPAN &&
    east - west <= MAX_LONGITUDE_SPAN
  const validLimit = Number.isInteger(query.limit) && query.limit > 0

  if (!validCoordinates || !validEnvelope || !boundedEnvelope || !validLimit) {
    throw new PaUnpavedRoadProviderError(
      "Use a valid, zoomed-in map envelope.",
      "INVALID_PA_UNPAVED_ROAD_QUERY",
      400
    )
  }

  return {
    bounds: { south, west, north, east },
    limit: Math.min(query.limit, PA_UNPAVED_ROADS_MAX_FEATURES)
  }
}

function normalizeFeature(value: unknown): PaUnpavedRoadFeature[] {
  if (!isRecord(value)) return []
  const properties = isRecord(value.properties) ? value.properties : {}
  const objectId = readObjectId(properties.OBJECTID ?? value.id)
  const geometry = normalizeGeometry(value.geometry)
  if (objectId === null || geometry === null) return []

  const id = `pa-unpaved-${objectId}`
  const county = typeof properties.COUNTY === "string"
    ? properties.COUNTY.trim().slice(0, 80) || null
    : null
  const lengthMeters = typeof properties.LENGTH === "number" &&
    Number.isFinite(properties.LENGTH) && properties.LENGTH >= 0
    ? properties.LENGTH
    : null

  return [{
    type: "Feature",
    id,
    geometry,
    properties: {
      id,
      county,
      lengthMeters,
      source: SOURCE,
      dataset: DATASET
    }
  }]
}

function normalizeGeometry(value: unknown): PaUnpavedRoadGeometry | null {
  if (!isRecord(value)) return null
  if (value.type === "LineString") {
    const coordinates = normalizeLine(value.coordinates)
    return coordinates ? { type: "LineString", coordinates } : null
  }
  if (value.type === "MultiLineString" && Array.isArray(value.coordinates)) {
    const coordinates = value.coordinates.map(normalizeLine)
    if (coordinates.length === 0 || coordinates.some((line) => line === null)) return null
    return {
      type: "MultiLineString",
      coordinates: coordinates as GeoJsonPosition[][]
    }
  }
  return null
}

function normalizeLine(value: unknown): GeoJsonPosition[] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const positions = value.map(normalizePosition)
  return positions.some((position) => position === null)
    ? null
    : positions as GeoJsonPosition[]
}

function normalizePosition(value: unknown): GeoJsonPosition | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const [longitude, latitude] = value
  if (
    typeof longitude !== "number" || !Number.isFinite(longitude) ||
    typeof latitude !== "number" || !Number.isFinite(latitude) ||
    longitude < -180 || longitude > 180 ||
    latitude < -90 || latitude > 90
  ) {
    return null
  }
  return [longitude, latitude]
}

function readObjectId(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return value
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

interface ArcGisGeoJsonResponse {
  features?: unknown
  exceededTransferLimit?: unknown
  properties?: { exceededTransferLimit?: unknown }
}

export type {
  PaUnpavedRoadBounds,
  PaUnpavedRoadFeature,
  PaUnpavedRoadFeatureCollection,
  PaUnpavedRoadGeometry,
  PaUnpavedRoadProperties,
  PaUnpavedRoadCorridorQuery,
  PaUnpavedRoadQuery
} from "./types"
