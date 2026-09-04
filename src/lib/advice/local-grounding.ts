import { filterFunStopCandidates, searchPlaces, type FunStopKind, type PlaceResult } from "@/lib/geocoding/photon"
import type { Coordinate } from "@/lib/routing/types"
import { haversine } from "@/lib/routing/scoring"
import type {
  AdvisorRouteContext,
  AdvisorToolDefinition,
  GroundedPlace,
  GroundingResult,
  GroundingSource,
  ProposedStopKind
} from "./contracts"

/**
 * The default grounding source: key-free, built on data Switchback already
 * fetches for the planner.
 *
 * This is what a self-hosted instance with no commercial keys gets, and it is
 * deliberately the *default* rather than the fallback — the advisor has to be
 * useful before anyone pays for a premium source (ADR 0021). Everything it
 * returns is a place that OpenStreetMap actually has, resolved through the same
 * Photon adapter the "fun stops" feature uses.
 */

const FUN_STOP_KINDS: readonly FunStopKind[] = ["brewery", "coffee", "food", "fuel"]
const MAX_PLACES_PER_CALL = 6
/** Search radius around a point on the route. */
const SEARCH_RADIUS_KM = 25

function isFunStopKind(value: unknown): value is FunStopKind {
  return typeof value === "string" && FUN_STOP_KINDS.includes(value as FunStopKind)
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

function placeId(kind: ProposedStopKind, place: PlaceResult, index: number): string {
  return `osm-${kind}-${index}-${place.lat.toFixed(4)}-${place.lon.toFixed(4)}`
}

function groundedPlace(kind: ProposedStopKind, place: PlaceResult, index: number): GroundedPlace {
  return {
    placeId: placeId(kind, place, index),
    name: place.label,
    kind,
    lat: place.lat,
    lon: place.lon,
    citations: [{
      title: "OpenStreetMap",
      url: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=16/${place.lat}/${place.lon}`,
      source: "switchback-local"
    }]
  }
}

export interface LocalGroundingOptions {
  /** Injected so unit tests never touch the network. */
  searchPlaces?: typeof searchPlaces
  /** Photon endpoint; defaults to the same one the planner's stop ideas use. */
  geocoderUrl?: string
}

const DEFAULT_PHOTON_URL = "https://photon.komoot.io/api/"

export function createLocalGrounding(options: LocalGroundingOptions = {}): GroundingSource {
  const search = options.searchPlaces ?? searchPlaces
  const baseUrl = options.geocoderUrl ?? DEFAULT_PHOTON_URL

  return {
    id: "switchback-local",
    // OSM's licence obliges attribution wherever its data is shown.
    attribution: "Place data © OpenStreetMap contributors",

    tools(): AdvisorToolDefinition[] {
      return [{
        name: "find_stops_along_route",
        description:
          "Find real places near a point on the rider's chosen route. Use this before " +
          "suggesting any stop — you may only propose a placeId this returns. " +
          "`progress` is how far along the route to look: 0 is the start, 1 the finish.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "progress"],
          properties: {
            kind: {
              type: "string",
              enum: [...FUN_STOP_KINDS],
              description: "What kind of stop the rider is after."
            },
            progress: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "How far along the route to search, 0 to 1."
            }
          }
        }
      }]
    },

    async call(
      name: string,
      args: Record<string, unknown>,
      context: AdvisorRouteContext
    ): Promise<GroundingResult> {
      if (name !== "find_stops_along_route") {
        return { content: { error: `Unknown tool ${name}.` }, places: [], citations: [] }
      }
      const kind = args.kind
      if (!isFunStopKind(kind)) {
        return { content: { error: "Choose a stop kind." }, places: [], citations: [] }
      }
      const center = pointAtProgress(context.geometry, Number(args.progress))
      if (!center) {
        return { content: { error: "This route has no geometry to search along." }, places: [], citations: [] }
      }

      const bias = { lat: center[1], lon: center[0] }
      let results: PlaceResult[]
      try {
        results = await search(kind, { baseUrl, bias, limit: 10 })
      } catch {
        // A grounding failure is a fact the model should have, not a crash:
        // it must then say it could not check rather than invent a stop.
        return {
          content: { error: "Place search was unavailable; do not suggest a stop for this leg." },
          places: [],
          citations: []
        }
      }

      const places = filterFunStopCandidates(results, kind, bias, SEARCH_RADIUS_KM)
        .slice(0, MAX_PLACES_PER_CALL)
        .map((place, index) => groundedPlace(kind, place, index))

      return {
        content: {
          places: places.map((place) => ({
            placeId: place.placeId,
            name: place.name,
            kind: place.kind,
            routeProgress: routeProgressOf(place, context.geometry)
          })),
          note: places.length === 0
            ? "Nothing mapped nearby. Say so rather than suggesting something."
            : "Propose at most two of these, by placeId."
        },
        places,
        citations: []
      }
    }
  }
}
