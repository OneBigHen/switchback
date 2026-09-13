import type {
  RouteTrafficEvidence,
  TrafficIncidentEvidence,
  TrafficIncidentGeometry,
  TrafficIncidentKind,
  TrafficRoutePoint
} from "./types"

const TOMTOM_INCIDENTS_URL = "https://api.tomtom.com/maps/orbis/traffic/incidents/details"
const CORRIDOR_BUFFER_KM = 2.5
const MAX_BOX_AREA_KM2 = 9_000
const MAX_POINTS_PER_BOX = 40
const MAX_CORRIDOR_BOXES = 8
const REQUEST_TIMEOUT_MS = 5_000
// BBox is retrieval only. Route evidence must be materially closer than the
// 2.5 km candidate corridor or a jam on a parallel arterial could be reported
// as delay on the rider's route. TomTom incident geometry and router geometry
// are both road-aligned, so 150 m leaves room for divided roads/interchanges
// without treating nearby streets as the same route.
const ROUTE_MATCH_TOLERANCE_METERS = 150
const METERS_PER_LAT_DEGREE = 111_320

const INCIDENT_ATTRIBUTES = [
  "incidents(",
  "geometry(type,coordinates),",
  "properties(",
  "id,iconCategory,magnitudeOfDelay,",
  "events(description,iconCategory),",
  "from,to,lengthInMeters,delayInSeconds,roadNumbers",
  ")",
  ")"
].join("")

export interface TrafficCorridorBox {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

export interface TomTomTrafficBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface TomTomTrafficOptions {
  apiKey?: string
  fetcher?: typeof fetch
  now?: () => Date
  baseUrl?: string
}

export interface TomTomMapTrafficResult {
  status: "available" | "unknown"
  incidents: TrafficIncidentEvidence[]
}

interface TomTomIncidentProperties {
  id?: unknown
  iconCategory?: unknown
  magnitudeOfDelay?: unknown
  events?: unknown
  from?: unknown
  to?: unknown
  lengthInMeters?: unknown
  delayInSeconds?: unknown
  roadNumbers?: unknown
}

interface TomTomIncident {
  properties?: TomTomIncidentProperties
  geometry?: unknown
}

type LonLat = [number, number]
type XY = [number, number]

function emptyEvidence(status: "unknown" | "degraded", now: () => Date): RouteTrafficEvidence {
  return {
    provider: "tomtom",
    status,
    observedAt: now().toISOString(),
    totalDelaySeconds: null,
    hasClosure: false,
    incidents: []
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function boxAreaKm2(box: TrafficCorridorBox): number {
  const meanLat = ((box.minLat + box.maxLat) / 2) * Math.PI / 180
  const heightKm = Math.abs(box.maxLat - box.minLat) * 111.32
  const widthKm = Math.abs(box.maxLon - box.minLon) * 111.32 * Math.max(0.01, Math.cos(meanLat))
  return heightKm * widthKm
}

function boxForPoints(points: TrafficRoutePoint[]): TrafficCorridorBox | null {
  if (points.length < 2) return null

  let minLat = 90
  let maxLat = -90
  let minLon = 180
  let maxLon = -180

  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null
    if (point.lat < -90 || point.lat > 90 || point.lon < -180 || point.lon > 180) return null
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLon = Math.min(minLon, point.lon)
    maxLon = Math.max(maxLon, point.lon)
  }

  // Crossing the antimeridian would make the ordinary bbox representation
  // misleading. SwitchBack currently targets regional PA/NJ rides; fail closed
  // rather than querying most of the globe.
  if (maxLon - minLon > 180) return null

  const meanLat = ((minLat + maxLat) / 2) * Math.PI / 180
  const latPad = CORRIDOR_BUFFER_KM / 111.32
  const lonPad = CORRIDOR_BUFFER_KM / (111.32 * Math.max(0.1, Math.cos(meanLat)))

  return {
    minLon: clamp(minLon - lonPad, -180, 180),
    minLat: clamp(minLat - latPad, -90, 90),
    maxLon: clamp(maxLon + lonPad, -180, 180),
    maxLat: clamp(maxLat + latPad, -90, 90)
  }
}

export function buildTrafficCorridorBoxes(points: TrafficRoutePoint[]): TrafficCorridorBox[] {
  if (points.length < 2) return []

  const boxes: TrafficCorridorBox[] = []
  let start = 0
  // Spread the route across the fan-out cap instead of a fixed point count:
  // a 400-point client sample would otherwise need more than MAX_CORRIDOR_BOXES
  // 40-point boxes and silently get no traffic lookup. The area check below
  // still splits any box that grows too large.
  const pointsPerBox = Math.max(MAX_POINTS_PER_BOX, Math.ceil((points.length - 1) / MAX_CORRIDOR_BOXES) + 1)

  while (start < points.length - 1) {
    let end = Math.min(points.length - 1, start + pointsPerBox - 1)
    let candidate: TrafficCorridorBox | null = null

    while (end > start) {
      candidate = boxForPoints(points.slice(start, end + 1))
      if (candidate && boxAreaKm2(candidate) <= MAX_BOX_AREA_KM2) break
      candidate = null
      end = Math.floor((start + end) / 2)
    }

    if (!candidate || end <= start) return []

    boxes.push(candidate)
    if (boxes.length > MAX_CORRIDOR_BOXES) return []
    start = end
  }

  return boxes
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function asNonnegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

function asRoadNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
}

function incidentDescription(events: unknown): string | null {
  if (!Array.isArray(events)) return null
  for (const event of events) {
    if (typeof event !== "object" || event === null) continue
    const description = asString((event as { description?: unknown }).description)
    if (description) return description
  }
  return null
}

function normalizeKind(category: string): TrafficIncidentKind {
  switch (category) {
    case "accident":
      return "accident"
    case "jam":
      return "jam"
    case "laneClosed":
    case "roadClosed":
      return "closure"
    case "roadWorks":
      return "roadworks"
    case "fog":
    case "rain":
    case "ice":
    case "wind":
    case "flooding":
      return "weather"
    case "brokenDownVehicle":
      return "breakdown"
    case "dangerousConditions":
      return "hazard"
    default:
      return "other"
  }
}

function normalizeGeometry(value: unknown): TrafficIncidentGeometry | null {
  if (typeof value !== "object" || value === null) return null
  const geometry = value as { type?: unknown; coordinates?: unknown }

  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [lon, lat] = geometry.coordinates
    if (typeof lon === "number" && typeof lat === "number" && Number.isFinite(lon) && Number.isFinite(lat)) {
      return { type: "Point", coordinates: [lon, lat] }
    }
  }

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    const coordinates: [number, number][] = []
    for (const coordinate of geometry.coordinates) {
      if (!Array.isArray(coordinate) || coordinate.length < 2) return null
      const [lon, lat] = coordinate
      if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) return null
      coordinates.push([lon, lat])
    }
    return coordinates.length > 0 ? { type: "LineString", coordinates } : null
  }

  return null
}

function normalizeIncident(value: unknown): TrafficIncidentEvidence | null {
  if (typeof value !== "object" || value === null) return null
  const incident = value as TomTomIncident
  if (typeof incident.properties !== "object" || incident.properties === null) return null

  const id = asString(incident.properties.id)
  const providerCategory = asString(incident.properties.iconCategory)
  if (!id || !providerCategory) return null

  return {
    id,
    kind: normalizeKind(providerCategory),
    providerCategory,
    magnitude: asString(incident.properties.magnitudeOfDelay),
    description: incidentDescription(incident.properties.events),
    delaySeconds: asNonnegativeNumber(incident.properties.delayInSeconds),
    lengthMeters: asNonnegativeNumber(incident.properties.lengthInMeters),
    roadNumbers: asRoadNumbers(incident.properties.roadNumbers),
    from: asString(incident.properties.from),
    to: asString(incident.properties.to),
    geometry: normalizeGeometry(incident.geometry)
  }
}

function project(point: LonLat, referenceLatitude: number): XY {
  const cosLatitude = Math.max(0.01, Math.cos(referenceLatitude * Math.PI / 180))
  return [
    point[0] * METERS_PER_LAT_DEGREE * cosLatitude,
    point[1] * METERS_PER_LAT_DEGREE
  ]
}

function pointToSegmentDistance(point: XY, start: XY, end: XY): number {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  if (dx === 0 && dy === 0) return Math.hypot(point[0] - start[0], point[1] - start[1])
  const t = clamp(
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy),
    0,
    1
  )
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy))
}

function orientation(a: XY, b: XY, c: XY): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function segmentsIntersect(a: XY, b: XY, c: XY, d: XY): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  return ((abC <= 0 && abD >= 0) || (abC >= 0 && abD <= 0))
    && ((cdA <= 0 && cdB >= 0) || (cdA >= 0 && cdB <= 0))
}

function segmentDistanceMeters(a: LonLat, b: LonLat, c: LonLat, d: LonLat): number {
  const referenceLatitude = (a[1] + b[1] + c[1] + d[1]) / 4
  const pa = project(a, referenceLatitude)
  const pb = project(b, referenceLatitude)
  const pc = project(c, referenceLatitude)
  const pd = project(d, referenceLatitude)
  if (segmentsIntersect(pa, pb, pc, pd)) return 0
  return Math.min(
    pointToSegmentDistance(pa, pc, pd),
    pointToSegmentDistance(pb, pc, pd),
    pointToSegmentDistance(pc, pa, pb),
    pointToSegmentDistance(pd, pa, pb)
  )
}

function pointNearRoute(point: LonLat, routePoints: TrafficRoutePoint[]): boolean {
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const start = routePoints[index]!
    const end = routePoints[index + 1]!
    const routeStart: LonLat = [start.lon, start.lat]
    const routeEnd: LonLat = [end.lon, end.lat]
    const referenceLatitude = (point[1] + start.lat + end.lat) / 3
    const projectedPoint = project(point, referenceLatitude)
    const distance = pointToSegmentDistance(
      projectedPoint,
      project(routeStart, referenceLatitude),
      project(routeEnd, referenceLatitude)
    )
    if (distance <= ROUTE_MATCH_TOLERANCE_METERS) return true
  }
  return false
}

function incidentMatchesRoute(incident: TrafficIncidentEvidence, routePoints: TrafficRoutePoint[]): boolean {
  const geometry = incident.geometry
  if (!geometry || routePoints.length < 2) return false
  if (geometry.type === "Point") return pointNearRoute(geometry.coordinates, routePoints)

  if (geometry.coordinates.length === 1) return pointNearRoute(geometry.coordinates[0]!, routePoints)
  for (let incidentIndex = 0; incidentIndex < geometry.coordinates.length - 1; incidentIndex += 1) {
    const incidentStart = geometry.coordinates[incidentIndex]!
    const incidentEnd = geometry.coordinates[incidentIndex + 1]!
    for (let routeIndex = 0; routeIndex < routePoints.length - 1; routeIndex += 1) {
      const routeStart = routePoints[routeIndex]!
      const routeEnd = routePoints[routeIndex + 1]!
      if (segmentDistanceMeters(
        incidentStart,
        incidentEnd,
        [routeStart.lon, routeStart.lat],
        [routeEnd.lon, routeEnd.lat]
      ) <= ROUTE_MATCH_TOLERANCE_METERS) return true
    }
  }
  return false
}

async function fetchBoxIncidents(
  box: TrafficCorridorBox,
  apiKey: string,
  fetcher: typeof fetch,
  baseUrl: string
): Promise<TrafficIncidentEvidence[]> {
  const url = new URL(baseUrl)
  url.searchParams.set("apiVersion", "2")
  url.searchParams.set("bbox", `${box.minLon},${box.minLat},${box.maxLon},${box.maxLat}`)
  url.searchParams.set("timeValidity", "present")

  const response = await fetcher(url, {
    method: "GET",
    headers: {
      "TomTom-Api-Key": apiKey,
      "TomTom-Api-Version": "2",
      "Accept-Language": "en-US",
      "Attributes": INCIDENT_ATTRIBUTES
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })

  if (!response.ok) throw new Error("TomTom traffic request failed")
  if (response.status === 204) return []

  const body = await response.json() as unknown
  if (typeof body !== "object" || body === null || !Array.isArray((body as { incidents?: unknown }).incidents)) {
    throw new Error("TomTom traffic response was malformed")
  }

  return (body as { incidents: unknown[] }).incidents
    .map(normalizeIncident)
    .filter((incident): incident is TrafficIncidentEvidence => incident !== null)
}

function mapBoundsBox(bounds: TomTomTrafficBounds): TrafficCorridorBox | null {
  const { west, south, east, north } = bounds
  if (![west, south, east, north].every(Number.isFinite)) return null
  if (west < -180 || east > 180 || south < -90 || north > 90) return null
  if (west >= east || south >= north || east - west > 180) return null
  const box = { minLon: west, minLat: south, maxLon: east, maxLat: north }
  return boxAreaKm2(box) <= MAX_BOX_AREA_KM2 ? box : null
}

export async function getTomTomTrafficForBounds(
  bounds: TomTomTrafficBounds,
  options: TomTomTrafficOptions = {}
): Promise<TomTomMapTrafficResult> {
  const apiKey = options.apiKey?.trim()
  if (!apiKey) return { status: "unknown", incidents: [] }

  const box = mapBoundsBox(bounds)
  if (!box) return { status: "unknown", incidents: [] }

  try {
    const incidents = await fetchBoxIncidents(
      box,
      apiKey,
      options.fetcher ?? fetch,
      options.baseUrl ?? TOMTOM_INCIDENTS_URL
    )
    return { status: "available", incidents }
  } catch {
    return { status: "unknown", incidents: [] }
  }
}

export async function getTomTomRouteTraffic(
  points: TrafficRoutePoint[],
  options: TomTomTrafficOptions = {}
): Promise<RouteTrafficEvidence> {
  const now = options.now ?? (() => new Date())
  const apiKey = options.apiKey?.trim()
  if (!apiKey) return emptyEvidence("unknown", now)

  const boxes = buildTrafficCorridorBoxes(points)
  if (boxes.length === 0) return emptyEvidence("unknown", now)

  const fetcher = options.fetcher ?? fetch
  const baseUrl = options.baseUrl ?? TOMTOM_INCIDENTS_URL
  const results = await Promise.allSettled(
    boxes.map((box) => fetchBoxIncidents(box, apiKey, fetcher, baseUrl))
  )

  const successful = results.filter(
    (result): result is PromiseFulfilledResult<TrafficIncidentEvidence[]> => result.status === "fulfilled"
  )
  if (successful.length === 0) return emptyEvidence("unknown", now)

  const incidentsById = new Map<string, TrafficIncidentEvidence>()
  for (const result of successful) {
    for (const incident of result.value) {
      if (incidentMatchesRoute(incident, points)) incidentsById.set(incident.id, incident)
    }
  }

  const incidents = [...incidentsById.values()]
  const hasClosure = incidents.some((incident) => incident.kind === "closure")
  const complete = successful.length === boxes.length
  const status = complete ? "available" : "degraded"
  const totalDelaySeconds = complete && !hasClosure
    ? incidents.reduce((sum, incident) => sum + (incident.delaySeconds ?? 0), 0)
    : null

  return {
    provider: "tomtom",
    status,
    observedAt: now().toISOString(),
    totalDelaySeconds,
    hasClosure,
    incidents
  }
}