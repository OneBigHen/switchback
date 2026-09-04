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
 * Google Maps grounding runs server-side inside the same Gemini call and tells
 * the model *what a place is like*. These tools are what turn that into
 * something Switchback can ride to: a name becomes a coordinate only by going
 * through Switchback's own geocoder, and a road becomes a suggestion only if it
 * is in the curvature database. That is the whole safety story — the model
 * chooses, Switchback resolves.
 *
 * The rider is a dual-sport rider. That is not a preference toggle here, it is
 * the shape of the data: gravel and unpaved surfaces are surfaced as a
 * *feature* of a road, breweries and diners are first-class stop kinds, and the
 * road lookup returns surface so the advisor can say "eight miles of gravel"
 * instead of hiding it.
 */

/** Stop kinds the rider can ask for. `brewery` is deliberately first. */
const STOP_KINDS: readonly FunStopKind[] = ["brewery", "coffee", "food", "fuel"]
const MAX_PLACES_PER_CALL = 6
const MAX_ROADS_PER_CALL = 5
/** How far off the route a stop may sit before it stops being "along the way". */
const STOP_RADIUS_KM = 25
/** Road search box around a point, in degrees (~25 km). */
const ROAD_SEARCH_DEGREES = 0.22
/** Only roads Switchback would actually call good. */
const MIN_ROAD_SCORE = 300

function isStopKind(value: unknown): value is FunStopKind {
  return typeof value === "string" && STOP_KINDS.includes(value as FunStopKind)
}

/** Where along the route a coordinate sits, 0 (start) to 1 (finish). */
export function routeProgressOf(
  point: { lat: number; lon: number },
  geometry: readonly Coordinate[]
): number | null {
  if (geometry.length < 2) return null
  let nearestIndex = 0
  let nearest = Number.POSITIVE_INFINITY
  for (let index = 0; index < geometry.length; index += 1) {
    const distance = haversine([point.lon, point.lat], geometry[index]!)
    if (distance < nearest) {
      nearest = distance
      nearestIndex = index
    }
  }
  return Number((nearestIndex / (geometry.length - 1)).toFixed(3))
}

/** The point on the route at a 0..1 progress fraction. */
function pointAtProgress(geometry: readonly Coordinate[], progress: number): Coordinate | null {
  if (geometry.length === 0) return null
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0.5))
  return geometry[Math.round(clamped * (geometry.length - 1))] ?? null
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
  // `label` is the full postal address, which reads terribly on a route card.
  // The rider wants "Brewery Fire", not "Brewery Fire, 4337 Old Taneytown Road,
  // Taneytown, MD 21787, United States" — the address stays as detail.
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

/** A point on the route, or the rider's origin, or nothing. */
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
      // A lookup failure is a fact the model should have, not a crash: it must
      // then say it could not check rather than inventing a stop.
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
          : "Google Maps can tell you which of these is actually worth stopping at — check before you recommend one."
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
          : "These are real, mapped coordinates. Reference a placeId to use one."
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

    const places = ranked.map((segment, index): GroundedPlace => {
      const midpoint = segment.geometry[Math.floor(segment.geometry.length / 2)]!
      return {
        placeId: `road-${segment.id}-${index}`,
        name: segment.name,
        kind: "road",
        lat: midpoint[1],
        lon: midpoint[0],
        detail: `curvature score ${Math.round(segment.score)}, surface ${segment.surface}`,
        citations: [osmCitation(midpoint[1], midpoint[0])]
      }
    })

    return {
      content: {
        roads: places.map((place, index) => ({
          placeId: place.placeId,
          name: place.name,
          surface: ranked[index]!.surface,
          unpaved: UNPAVED.has(ranked[index]!.surface.toLowerCase()),
          curvatureScore: Math.round(ranked[index]!.score),
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
        ? "`progress` is how far along the rider's route to look: 0 is the start, 1 the finish."
        : "There is no route yet, so this searches around the rider's current location."

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
              progress: { type: "number", description: "0 to 1 along the route." }
            },
            required: ["kind"]
          }
        },
        {
          name: "lookup_place",
          description:
            "Turn a place name, town, or address into real coordinates Switchback can ride to. " +
            "Use this to pin a start or destination the rider named, and to pin anything Google " +
            "Maps told you about — Maps gives you the name and address, this gives you the point.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Place name, address, or town." },
              kind: { type: "string", enum: [...STOP_KINDS, "scenic"] },
              progress: { type: "number", description: "0 to 1 along the route, to bias the search." }
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
            "score and surface. Set surface to 'unpaved' to find gravel and dirt, which this " +
            "rider is on a dual-sport and actively wants. " + where,
          parameters: {
            type: "object",
            properties: {
              progress: { type: "number", description: "0 to 1 along the route." },
              surface: {
                type: "string",
                enum: ["any", "paved", "unpaved"],
                description: "'unpaved' finds gravel and dirt for dual-sport riding."
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
