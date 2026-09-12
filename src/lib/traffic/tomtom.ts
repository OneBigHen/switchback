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

interface TomTomTrafficOptions {
  apiKey?: string
  fetcher?: typeof fetch
  now?: () => Date
  baseUrl?: string
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

  while (start < points.length - 1) {
    let end = Math.min(points.length - 1, start + MAX_POINTS_PER_BOX - 1)
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
    for (const incident of result.value) incidentsById.set(incident.id, incident)
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
