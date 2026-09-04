import {
  filterFunStopCandidates,
  searchPlaces,
  type FunStopKind,
  type PlaceResult
} from "@/lib/geocoding/photon"
import type { CurvatureSegment } from "@/lib/curvature/repository"
import type { Coordinate } from "@/lib/routing/types"
import { haversine } from "@/lib/routing/scoring"
import type {
  AdviceRequest,
  AdvisorToolbox,
  AdvisorToolDefinition,
  GroundedPlace,
  ProposedStopKind,
  ToolResult
} from "./contracts"

/**
 * Everything the advisor can look up that Switchback owns.
 *
 * Google Maps grounding can describe a place, but these tools are what turn a
 * name into something Switchback can actually route to. Coordinates always
 * come from Switchback-owned resolution; road character comes from the local
 * curvature dataset when configured.
 */

const STOP_KINDS: readonly FunStopKind[] = ["brewery", "coffee", "food", "fuel"]
const MAX_PLACES_PER_CALL = 6
const MAX_ROADS_PER_CALL = 5
const STOP_RADIUS_KM = 25
const ROAD_SEARCH_DEGREES = 0.22
const MIN_ROAD_SCORE = 300

function isStopKind(value: unknown): value is FunStopKind {
  return typeof value === "string" && STOP_KINDS.includes(value as FunStopKind)
}

interface RouteSegment {
  from: Coordinate
  to: Coordinate
  meters: number
  beforeMeters: number
}

function routeSegments(geometry: readonly Coordinate[]): { segments: RouteSegment[]; totalMeters: number } {
  const segments: RouteSegment[] = []
  let totalMeters = 0
  for (let index = 0; index < geometry.length - 1; index += 1) {
    const from = geometry[index]!
    const to = geometry[index + 1]!
    const meters = haversine(from, to)
    if (!Number.isFinite(meters) || meters <= 0) continue
    segments.push({ from, to, meters, beforeMeters: totalMeters })
    totalMeters += meters
  }
  return { segments, totalMeters }
}

/** Local equirectangular projection is sufficient for finding a point on one route segment. */
function projectedFraction(point: { lat: number; lon: number }, from: Coordinate, to: Coordinate): number {
  const meanLat = (point.lat + from[1] + to[1]) / 3 * Math.PI / 180
  const xScale = Math.cos(meanLat)
  const ax = from[0] * xScale
  const ay = from[1]
  const bx = to[0] * xScale
  const by = to[1]
  const px = point.lon * xScale
  const py = point.lat
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= Number.EPSILON) return 0
  return Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
}

function interpolate(from: Coordinate, to: Coordinate, fraction: number): Coordinate {
  return [
    from[0] + (to[0] - from[0]) * fraction,
    from[1] + (to[1] - from[1]) * fraction
  ]
}

/** Where along the travelled route a coordinate sits, 0 (start) to 1 (finish). */
export function routeProgressOf(
  point: { lat: number; lon: number },
  geometry: readonly Coordinate[]
): number | null {
  if (geometry.length < 2) return null
  const { segments, totalMeters } = routeSegments(geometry)
  if (segments.length === 0 || totalMeters <= 0) return null

  let nearestMeters = Number.POSITIVE_INFINITY
  let progressMeters = 0
  for (const segment of segments) {
    const fraction = projectedFraction(point, segment.from, segment.to)
    const projected = interpolate(segment.from, segment.to, fraction)
    const offRouteMeters = haversine([point.lon, point.lat], projected)
    if (offRouteMeters < nearestMeters) {
      nearestMeters = offRouteMeters
      progressMeters = segment.beforeMeters + segment.meters * fraction
    }
  }
  return Number(Math.max(0, Math.min(1, progressMeters / totalMeters)).toFixed(3))
}

/** The actual distance-based point on the route at a 0..1 progress fraction. */
function pointAtProgress(geometry: readonly Coordinate[], progress: number): Coordinate | null {
  if (geometry.length === 0) return null
  if (geometry.length === 1) return geometry[0] ?? null
  const { segments, totalMeters } = routeSegments(geometry)
  if (segments.length === 0 || totalMeters <= 0) return geometry[0] ?? null
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0.5))
  const target = clamped * totalMeters
  const segment = segments.find((entry) => entry.beforeMeters + entry.meters >= target) ?? segments.at(-1)!
  const fraction = Math.max(0, Math.min(1, (target - segment.beforeMeters) / segment.meters))
  return interpolate(segment.from, segment.to, fraction)
}

const UNPAVED = new Set([
  "compacted", "dirt", "earth", "fine_gravel", "grass", "gravel", "ground", "mud", "sand", "unpaved"
])

function osmCitation(lat: number, lon: number) {
  return {
    title: "OpenStreetMap",
    url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
    source: "switchback-local" as const
  }
}

function groundedPlace(
  kind: ProposedStopKind,
  place: PlaceResult,
  index: number,
  prefix: string
): GroundedPlace {
  const name = place.name?.trim() || place.label
  return {
    placeId: `${prefix}-${kind}-${index}-${place.lat.toFixed(4)}-${place.lon.toFixed(4)}`,
    name,
    kind,
    lat: place.lat,
    lon: place.lon,
    ...(place.label && place.label !== name ? { detail: place.label } : {}),
    citations: [osmCitation(place.lat, place.lon)]
  }
}

function anchorFor(input: AdviceRequest, progress: number): Coordinate | null {
  const onRoute = input.context ? pointAtProgress(input.context.geometry, progress) : null
  if (onRoute) return onRoute
  if (input.origin) return [input.origin.lon, input.origin.lat]
  return null
}

export interface AdvisorToolboxOptions {
  /** Injected so unit tests never touch the network. */
  searchPlaces?: typeof searchPlaces
  /** Injected curvature lookup; absent means the road tool is not offered. */
  queryRoads?: (bounds: {
    south: number
    west: number
    north: number
    east: number
    minScore: number
    limit: number
  }) => CurvatureSegment[]
  geocoderUrl?: string
}

const DEFAULT_PHOTON_URL = "https://photon.komoot.io/api/"

export function createAdvisorToolbox(options: AdvisorToolboxOptions = {}): AdvisorToolbox {
  const search = options.searchPlaces ?? searchPlaces
  const baseUrl = options.geocoderUrl ?? DEFAULT_PHOTON_URL

  const findStops = async (
    args: Record<string, unknown>,
    input: AdviceRequest
  ): Promise<ToolResult> => {
    const kind = args.kind
    if (!isStopKind(kind)) {
      return { content: { error: "Choose brewery, coffee, food, or fuel." }, places: [], citations: [] }
    }
    const anchor = anchorFor(input, Number(args.progress ?? 0.5))
    if (!anchor) {
      return {
        content: { error: "No route or location to search around yet — ask the rider where they are starting." },
        places: [],
        citations: []
      }
    }
    const bias = { lat: anchor[1], lon: anchor[0] }
    let results: PlaceResult[]
    try {
      results = await search(kind, { baseUrl, bias, limit: 10 })
    } catch {
      return {
        content: { error: "Place search was unavailable; do not suggest a stop for this leg." },
        places: [],
        citations: []
      }
    }
    const places = filterFunStopCandidates(results, kind, bias, STOP_RADIUS_KM)
      .slice(0, MAX_PLACES_PER_CALL)
      .map((place, index) => groundedPlace(kind, place, index, "osm"))

    return {
      content: {
        places: places.map((place) => ({
          placeId: place.placeId,
          name: place.name,
          ...(place.detail ? { address: place.detail } : {}),
          kind: place.kind,
          routeProgress: input.context ? routeProgressOf(place, input.context.geometry) : null
        })),
        note: places.length === 0
          ? "Nothing mapped nearby. Say so rather than suggesting something."
          : "These places are mapped and routable. Check available grounding before making a quality or hours claim."
      },
      places,
      citations: []
    }
  }

  const lookupPlace = async (
    args: Record<string, unknown>,
    input: AdviceRequest
  ): Promise<ToolResult> => {
    const query = typeof args.query === "string" ? args.query.trim().slice(0, 200) : ""
    if (query.length < 2) {
      return { content: { error: "Give a place name, address, or town." }, places: [], citations: [] }
    }
    const anchor = anchorFor(input, Number(args.progress ?? 0.5))
    let results: PlaceResult[]
    try {
      results = await search(query, {
        baseUrl,
        limit: 5,
        ...(anchor ? { bias: { lat: anchor[1], lon: anchor[0] } } : {})
      })
    } catch {
      return { content: { error: "Place lookup was unavailable." }, places: [], citations: [] }
    }
    const kind: ProposedStopKind = isStopKind(args.kind) ? args.kind : "scenic"
    const places = results.slice(0, 4).map((place, index) => groundedPlace(kind, place, index, "geo"))
    return {
      content: {
        places: places.map((place) => ({
          placeId: place.placeId,
          name: place.name,
          ...(place.detail ? { address: place.detail } : {})
        })),
        note: places.length === 0
          ? "That place could not be found. Ask the rider to name it differently rather than guessing where it is."
          : "These are mapped coordinates. Reference a placeId to use one."
      },
      places,
      citations: []
    }
  }

  const findRoads = async (
    args: Record<string, unknown>,
    input: AdviceRequest
  ): Promise<ToolResult> => {
    const queryRoads = options.queryRoads
    if (!queryRoads) {
      return { content: { error: "Road character data is unavailable here." }, places: [], citations: [] }
    }
    const anchor = anchorFor(input, Number(args.progress ?? 0.5))
    if (!anchor) {
      return {
        content: { error: "No route or location yet — ask the rider where they are starting." },
        places: [],
        citations: []
      }
    }
    let segments: CurvatureSegment[]
    try {
      segments = queryRoads({
        south: anchor[1] - ROAD_SEARCH_DEGREES,
        north: anchor[1] + ROAD_SEARCH_DEGREES,
        west: anchor[0] - ROAD_SEARCH_DEGREES,
        east: anchor[0] + ROAD_SEARCH_DEGREES,
        minScore: MIN_ROAD_SCORE,
        limit: 40
      })
    } catch {
      return { content: { error: "Road character lookup was unavailable." }, places: [], citations: [] }
    }

    const wantsGravel = args.surface === "unpaved"
    const ranked = segments
      .filter((segment) => {
        if (args.surface === "paved") return !UNPAVED.has(segment.surface.toLowerCase())
        if (wantsGravel) return UNPAVED.has(segment.surface.toLowerCase())
        return true
      })
      .slice(0, MAX_ROADS_PER_CALL)

    const places = ranked.flatMap((segment, index): GroundedPlace[] => {
      const midpoint = segment.geometry[Math.floor(segment.geometry.length / 2)]
      if (!midpoint) return []
      return [{
        placeId: `road-${segment.id}-${index}`,
        name: segment.name,
        kind: "road",
        lat: midpoint[1],
        lon: midpoint[0],
        detail: `curvature score ${Math.round(segment.score)}, surface ${segment.surface}`,
        citations: [osmCitation(midpoint[1], midpoint[0])]
      }]
    })

    return {
      content: {
        roads: places.map((place, index) => ({
          placeId: place.placeId,
          name: place.name,
          surface: ranked[index]?.surface ?? "unknown",
          unpaved: UNPAVED.has((ranked[index]?.surface ?? "unknown").toLowerCase()),
          curvatureScore: Math.round(ranked[index]?.score ?? 0),
          routeProgress: input.context ? routeProgressOf(place, input.context.geometry) : null
        })),
        note: places.length === 0
          ? "No mapped standout roads there. Say so."
          : "These are scored from mapped geometry. Reference a placeId to route through one."
      },
      places,
      citations: []
    }
  }

  return {
    definitions(input: AdviceRequest): AdvisorToolDefinition[] {
      const alongRoute = input.context !== null
      const where = alongRoute
        ? "`progress` is distance along the rider's route: 0 is the start, 1 the finish."
        : "There is no route yet, so this searches around the rider's selected start when available."

      const definitions: AdvisorToolDefinition[] = [
        {
          name: "find_stops",
          description:
            "Find real, mapped places the rider could stop at — breweries, coffee, food, fuel. " +
            "Call this before suggesting any stop: you may only propose a placeId this returns. " +
            where,
          parameters: {
            type: "object",
            properties: {
              kind: { type: "string", enum: [...STOP_KINDS] },
              progress: { type: "number", minimum: 0, maximum: 1, description: "0 to 1 along the route." }
            },
            required: ["kind"]
          }
        },
        {
          name: "lookup_place",
          description:
            "Turn a place name, town, or address into real coordinates Switchback can ride to. " +
            "Use this to pin a start or destination the rider named, and to pin any place a " +
            "grounding source told you about before it can enter a proposed ride.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Place name, address, or town." },
              kind: { type: "string", enum: [...STOP_KINDS, "scenic"] },
              progress: { type: "number", minimum: 0, maximum: 1, description: "0 to 1 along the route, to bias the search." }
            },
            required: ["query"]
          }
        }
      ]

      if (options.queryRoads) {
        definitions.push({
          name: "find_good_roads",
          description:
            "Find roads Switchback has actually scored as good riding near a point — curvature " +
            "score and surface. Set surface to 'unpaved' to find gravel and dirt. " + where,
          parameters: {
            type: "object",
            properties: {
              progress: { type: "number", minimum: 0, maximum: 1, description: "0 to 1 along the route." },
              surface: {
                type: "string",
                enum: ["any", "paved", "unpaved"],
                description: "'unpaved' finds mapped gravel and dirt."
              }
            },
            required: []
          }
        })
      }
      return definitions
    },

    async call(
      name: string,
      args: Record<string, unknown>,
      input: AdviceRequest
    ): Promise<ToolResult> {
      switch (name) {
        case "find_stops": return findStops(args, input)
        case "lookup_place": return lookupPlace(args, input)
        case "find_good_roads": return findRoads(args, input)
        default:
          return { content: { error: `Unknown tool ${name}.` }, places: [], citations: [] }
      }
    }
  }
}
