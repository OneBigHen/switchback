import type { RiderLayerId } from "@/lib/client/map-layers"

export interface MapFeatureBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface MapFeatureRequest {
  bounds: MapFeatureBounds
  layers: RiderLayerId[]
}

export interface RiderFeatureCollection {
  type: "FeatureCollection"
  features: RiderFeature[]
}

interface RiderFeature {
  type: "Feature"
  properties: Record<string, string>
  geometry: {
    type: "Point" | "LineString" | "Polygon"
    coordinates: [number, number] | [number, number][] | [number, number][][]
  }
}

interface OverpassElement {
  type?: "node" | "way" | "relation"
  id?: number
  lat?: number
  lon?: number
  center?: { lat?: number; lon?: number }
  geometry?: Array<{ lat?: number; lon?: number }>
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements?: OverpassElement[]
}

interface NwsFeature {
  id?: string
  properties?: Record<string, unknown>
  geometry?: { type?: string; coordinates?: unknown }
}

interface NwsResponse {
  features?: NwsFeature[]
}

export interface RiderMapFeatureOptions {
  overpassUrl: string
  nwsUserAgent: string
  fetcher?: typeof fetch
}

const OVERPASS_SELECTORS: Partial<Record<RiderLayerId, string[]>> = {
  "public-land": [
    'way["boundary"="protected_area"]',
    'way["leisure"="nature_reserve"]'
  ],
  "private-land": [
    'way["access"="private"]',
    'way["access"="no"]'
  ],
  mvum: [
    'way["operator"~"Forest Service",i]["highway"]',
    'way["ref"~"^FS ",i]["highway"]'
  ],
  closures: [
    'way["highway"="construction"]',
    'way["construction"]["highway"]'
  ],
  traffic: [
    'node["highway"="traffic_signals"]',
    'node["highway"="stop"]'
  ],
  fuel: ['node["amenity"="fuel"]'],
  food: [
    'node["amenity"="restaurant"]',
    'node["amenity"="fast_food"]',
    'node["amenity"="cafe"]'
  ],
  camping: [
    'node["tourism"="camp_site"]',
    'node["tourism"="caravan_site"]'
  ],
  lodging: [
    'node["tourism"="hotel"]',
    'node["tourism"="motel"]',
    'node["tourism"="guest_house"]'
  ],
  repair: [
    'node["shop"="motorcycle"]',
    'node["shop"="car_repair"]',
    'node["service:vehicle:repair"="yes"]'
  ],
  "cell-coverage": [
    'node["man_made"="communications_tower"]',
    'node["communication:mobile_phone"="yes"]'
  ]
}

function emptyCollection(): RiderFeatureCollection {
  return { type: "FeatureCollection", features: [] }
}

function formatBounds(bounds: MapFeatureBounds): string {
  return `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
}

export function createOverpassQuery(request: MapFeatureRequest): string | null {
  const bbox = formatBounds(request.bounds)
  const selections = request.layers.flatMap((layer) => (OVERPASS_SELECTORS[layer] ?? [])
    .map((selector) => `${selector}(${bbox});`))
  if (selections.length === 0) return null
  // Boundary ways can contain thousands of vertices. Centres keep interactive
  // layer requests fast while still placing each matching feature on the map.
  return `[out:json][timeout:15];(${selections.join("")});out center 600;`
}

function coordinate(value: { lat?: number; lon?: number } | undefined): [number, number] | null {
  if (!value || !Number.isFinite(value.lon) || !Number.isFinite(value.lat)) return null
  return [value.lon!, value.lat!]
}

function featureLayer(element: OverpassElement, requested: RiderLayerId[]): RiderLayerId | null {
  const tags = element.tags ?? {}
  if (requested.includes("public-land") && (tags.boundary === "protected_area" || tags.leisure === "nature_reserve")) return "public-land"
  if (requested.includes("private-land") && (tags.access === "private" || tags.access === "no")) return "private-land"
  if (requested.includes("mvum") && (/forest service/i.test(tags.operator ?? "") || /^FS /i.test(tags.ref ?? ""))) return "mvum"
  if (requested.includes("closures") && (tags.highway === "construction" || Boolean(tags.construction))) return "closures"
  if (requested.includes("traffic") && (tags.highway === "traffic_signals" || tags.highway === "stop")) return "traffic"
  if (requested.includes("fuel") && tags.amenity === "fuel") return "fuel"
  if (requested.includes("food") && ["restaurant", "fast_food", "cafe"].includes(tags.amenity ?? "")) return "food"
  if (requested.includes("camping") && ["camp_site", "caravan_site"].includes(tags.tourism ?? "")) return "camping"
  if (requested.includes("lodging") && ["hotel", "motel", "guest_house"].includes(tags.tourism ?? "")) return "lodging"
  if (requested.includes("repair") && (tags.shop === "motorcycle" || tags.shop === "car_repair" || tags["service:vehicle:repair"] === "yes")) return "repair"
  if (requested.includes("cell-coverage") && (tags.man_made === "communications_tower" || tags["communication:mobile_phone"] === "yes")) return "cell-coverage"
  return null
}

function isPolygon(element: OverpassElement, coordinates: [number, number][]): boolean {
  const first = coordinates[0]
  const last = coordinates.at(-1)
  const tags = element.tags ?? {}
  return Boolean(first && last && first[0] === last[0] && first[1] === last[1] && (
    tags.area === "yes" || tags.boundary === "protected_area" || tags.leisure === "nature_reserve"
  ))
}

function normalizeElement(element: OverpassElement, requested: RiderLayerId[]): RiderFeature | null {
  const layerId = featureLayer(element, requested)
  if (!layerId) return null
  const tags = element.tags ?? {}
  const properties = {
    layerId,
    name: tags.name ?? tags.ref ?? tags.operator ?? layerId,
    sourceId: `${element.type ?? "feature"}-${element.id ?? "unknown"}`
  }
  if (element.type === "node") {
    const point = coordinate(element)
    return point ? { type: "Feature", properties, geometry: { type: "Point", coordinates: point } } : null
  }
  const centre = coordinate(element.center)
  if (centre) return { type: "Feature", properties, geometry: { type: "Point", coordinates: centre } }
  const coordinates = (element.geometry ?? []).map(coordinate).filter((value): value is [number, number] => value !== null)
  if (coordinates.length < 2) return null
  if (isPolygon(element, coordinates)) {
    return { type: "Feature", properties, geometry: { type: "Polygon", coordinates: [coordinates] } }
  }
  return { type: "Feature", properties, geometry: { type: "LineString", coordinates } }
}

export function normalizeOverpassFeatures(payload: OverpassResponse, requested: RiderLayerId[]): RiderFeatureCollection {
  const features = (payload.elements ?? [])
    .map((element) => normalizeElement(element, requested))
    .filter((feature): feature is RiderFeature => feature !== null)
  return { type: "FeatureCollection", features }
}

function isNwsGeometry(geometry: NwsFeature["geometry"]): geometry is RiderFeature["geometry"] {
  if (!geometry || !["Point", "LineString", "Polygon"].includes(geometry.type ?? "")) return false
  return Array.isArray(geometry.coordinates)
}

async function getNwsAlertFeatures(
  bounds: MapFeatureBounds,
  options: RiderMapFeatureOptions
): Promise<RiderFeature[]> {
  const latitude = ((bounds.south + bounds.north) / 2).toFixed(5)
  const longitude = ((bounds.west + bounds.east) / 2).toFixed(5)
  const response = await (options.fetcher ?? fetch)(
    `https://api.weather.gov/alerts/active?point=${latitude},${longitude}`,
    { headers: { accept: "application/geo+json", "user-agent": options.nwsUserAgent }, signal: AbortSignal.timeout(12_000) }
  )
  if (!response.ok) return []
  const payload = await response.json() as NwsResponse
  return (payload.features ?? []).flatMap((feature, index) => isNwsGeometry(feature.geometry) ? [{
    type: "Feature" as const,
    properties: {
      layerId: "weather",
      name: String(feature.properties?.event ?? feature.properties?.headline ?? "Active weather alert"),
      sourceId: feature.id ?? `nws-${index}`
    },
    geometry: feature.geometry
  }] : [])
}

export async function getRiderMapFeatures(
  request: MapFeatureRequest,
  options: RiderMapFeatureOptions
): Promise<RiderFeatureCollection> {
  const fetcher = options.fetcher ?? fetch
  const query = createOverpassQuery(request)
  const work: Array<Promise<RiderFeature[]>> = []
  if (query) {
    work.push(fetcher(options.overpassUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": "Switchback route planner/0.1 (map data)"
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(18_000)
    }).then(async (response) => {
      if (!response.ok) throw new Error(`OpenStreetMap map-data request failed with ${response.status}`)
      const payload = await response.json() as OverpassResponse
      return normalizeOverpassFeatures(payload, request.layers).features
    }))
  }
  if (request.layers.includes("weather")) work.push(getNwsAlertFeatures(request.bounds, options))
  if (work.length === 0) return emptyCollection()
  const collections = await Promise.allSettled(work)
  if (!collections.some((result) => result.status === "fulfilled")) {
    throw new Error("No map-data provider could serve the selected layers")
  }
  return {
    type: "FeatureCollection",
    features: collections.flatMap((result) => result.status === "fulfilled" ? result.value : [])
  }
}
