import {
  filterFunStopCandidates,
  searchNearbyPlaces,
  searchPlaces,
  type FunStopKind,
  type PlaceResult
} from "@/lib/geocoding/photon"
import type { CurvatureSegment } from "@/lib/curvature/repository"
import {
  PA_UNPAVED_ROADS_PROVENANCE,
  PA_UNPAVED_ROADS_SURFACE_BOUNDARY,
  type PaUnpavedRoadBounds,
  type PaUnpavedRoadFeature,
  type PaUnpavedRoadFeatureCollection
} from "@/lib/roads/types"
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
 * Everything the advisor can look up that OpenGravel owns.
 *
 * Google Maps grounding can describe a place, but these tools are what turn a
 * name into something OpenGravel can actually route to. Coordinates always
 * come from OpenGravel-owned resolution; road character comes from the local
 * curvature dataset when configured.
 */

const STOP_KINDS: readonly FunStopKind[] = ["brewery", "coffee", "food", "fuel"]
const MAX_PLACES_PER_CALL = 6
const MAX_ROADS_PER_CALL = 5
const MAX_OFFICIAL_UNPAVED_PER_CALL = 6
const STOP_RADIUS_KM = 25
const ROAD_SEARCH_DEGREES = 0.22
const MIN_ROAD_SCORE = 300
const PA_UNPAVED_ROADS_LAYER_URL =
  "https://mapservices.pasda.psu.edu/server/rest/services/pasda/DEP/MapServer/33"

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

const UNKNOWN_SURFACE = new Set(["", "unknown", "missing", "unclassified"])

/**
 * What the curvature dataset actually says about one segment's surface.
 *
 * Most of the scored network carries no surface tag at all. Reading that as
 * "paved" would have the Goblin promise pavement it cannot see, and reading it
 * as "not gravel" would have it declare a county gravel-free on no evidence.
 */
function surfaceClass(surface: string): "paved" | "unpaved" | "unknown" {
  const normalized = surface.trim().toLowerCase()
  if (UNKNOWN_SURFACE.has(normalized)) return "unknown"
  return UNPAVED.has(normalized) ? "unpaved" : "paved"
}

function surfaceNote(input: {
  returned: number
  scoredNearby: number
  withoutSurfaceData: number
  wantsGravel: boolean
  official: OfficialGravelLookup
}): string {
  const { returned, scoredNearby, withoutSurfaceData, wantsGravel, official } = input
  const blindSpot = withoutSurfaceData > 0
    ? ` ${withoutSurfaceData} of the ${scoredNearby} curve-scored roads nearby carry no surface tag, so that dataset can neither confirm nor rule out gravel on them.`
    : ""
  const curveEvidence = returned > 0
    ? ` ${returned} curve-scored road${returned === 1 ? " is" : "s are"} mapped as unpaved in OpenGravel's road data.`
    : ""
  const accessBoundary = ` ${PA_UNPAVED_ROADS_SURFACE_BOUNDARY}.`

  if (wantsGravel && official.places.length > 0) {
    return `officialUnpavedRoads lists ${official.places.length} ${PA_UNPAVED_ROADS_PROVENANCE} survey ` +
      "features near here. Mention them as historic surveyed/mapped unpaved surface evidence or a proposed stop; do not make a " +
      "survey midpoint a hard waypoint in a timeboxed loop. Do not call this tool again for surface." +
      curveEvidence + blindSpot + accessBoundary
  }
  if (wantsGravel && official.status === "unavailable") {
    return `The ${PA_UNPAVED_ROADS_PROVENANCE} survey did not answer just now, so its evidence is ` +
      "UNCHECKED, not absent. Never turn that outage into a claim that there is no gravel." +
      curveEvidence + blindSpot + accessBoundary
  }
  if (wantsGravel && official.status === "absent") {
    if (returned > 0) {
      return `The ${PA_UNPAVED_ROADS_PROVENANCE} survey is not configured here.` + curveEvidence + blindSpot + accessBoundary
    }
    return `The ${PA_UNPAVED_ROADS_PROVENANCE} survey is not configured here, so gravel is UNCHECKED, not absent. ` +
      "The curve-scored roads returned no known unpaved tags; where surface tags are missing, surface is unknown rather than paved." +
      blindSpot + accessBoundary
  }
  if (wantsGravel && returned > 0) {
    return `No ${PA_UNPAVED_ROADS_PROVENANCE} survey features near here were returned by this bounded lookup.` +
      curveEvidence + blindSpot + accessBoundary
  }
  if (wantsGravel) {
    return `No ${PA_UNPAVED_ROADS_PROVENANCE} survey features near here were returned by this bounded lookup. ` +
      "That does not prove gravel is absent; the curve-scored roads returned no known unpaved tags, and missing " +
      "surface tags remain unknown." + blindSpot + accessBoundary
  }
  if (returned > 0) {
    return "These are scored from mapped geometry. Mention a matching road as evidence, and only route through its " +
      "placeId when the rider explicitly asks to visit it." + blindSpot
  }
  return "No mapped standout roads matched there." + blindSpot
}

/**
 * Whether the official survey answered, and what it said.
 *
 * `absent` means this deployment has no such source; `unavailable` means it has
 * one and it did not answer. Both are silence, and neither is "no gravel".
 */
interface OfficialGravelLookup {
  status: "ok" | "unavailable" | "absent"
  places: GroundedPlace[]
}

function featureMidpoint(feature: PaUnpavedRoadFeature): Coordinate | null {
  const line = feature.geometry.type === "LineString"
    ? feature.geometry.coordinates
    : feature.geometry.coordinates.flat()
  return line[Math.floor(line.length / 2)] ?? null
}

function osmCitation(lat: number, lon: number) {
  return {
    title: "OpenStreetMap",
    url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
    source: "switchback-local" as const
  }
}

function officialSurveyCitation() {
  return {
    title: PA_UNPAVED_ROADS_PROVENANCE,
    url: PA_UNPAVED_ROADS_LAYER_URL,
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
  /** Injected so unit tests never touch the network. */
  searchNearbyPlaces?: typeof searchNearbyPlaces
  /** Injected curvature lookup; absent means the road tool is not offered. */
  queryRoads?: (bounds: {
    south: number
    west: number
    north: number
    east: number
    minScore: number
    limit: number
  }) => CurvatureSegment[]
  /**
   * Injected official unpaved-road lookup. Server-supplied so the provider
   * module stays out of the client bundle this file is reachable from.
   */
  queryOfficialUnpaved?: (bounds: PaUnpavedRoadBounds) => Promise<PaUnpavedRoadFeatureCollection>
  geocoderUrl?: string
}

const DEFAULT_PHOTON_URL = "https://photon.komoot.io/api/"

export function createAdvisorToolbox(options: AdvisorToolboxOptions = {}): AdvisorToolbox {
  const search = options.searchPlaces ?? searchPlaces
  const searchNearby = options.searchNearbyPlaces ?? searchNearbyPlaces
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
      // Proximity search by OSM tag, not a name search for the word "brewery".
      results = await searchNearby(kind, {
        baseUrl,
        center: bias,
        radiusKm: STOP_RADIUS_KM,
        limit: 20
      })
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
        search: { kind, radiusKm: STOP_RADIUS_KM, coverage: "partial", center: bias },
        places: places.map((place) => ({
          placeId: place.placeId,
          name: place.name,
          ...(place.detail ? { address: place.detail } : {}),
          kind: place.kind,
          routeProgress: input.context ? routeProgressOf(place, input.context.geometry) : null
        })),
        note: places.length === 0
          ? "This bounded search returned no matching stops. Coverage is incomplete; this does not establish that no stops exist."
          : "These are mapped place-search matches, not verified route access. Coverage is incomplete. Check routing and grounding before claiming access, quality or hours."
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

  /**
   * Historic surveyed/mapped unpaved surface evidence near a point.
   *
   * The source is the `PA DEP/PASDA — Unpaved Roads 2009_07` dataset. It supplies
   * surface evidence and geometry only, not legal or public access, current
   * openness, closure, maintenance or passability. It publishes county and
   * length but no road name, so the midpoint is only an evidence anchor unless
   * the rider explicitly asks to visit it.
   */
  const officialGravelPlaces = async (anchor: Coordinate): Promise<OfficialGravelLookup> => {
    const queryOfficialUnpaved = options.queryOfficialUnpaved
    if (!queryOfficialUnpaved) return { status: "absent", places: [] }
    let collection: PaUnpavedRoadFeatureCollection
    try {
      collection = await queryOfficialUnpaved({
        south: anchor[1] - ROAD_SEARCH_DEGREES,
        north: anchor[1] + ROAD_SEARCH_DEGREES,
        west: anchor[0] - ROAD_SEARCH_DEGREES,
        east: anchor[0] + ROAD_SEARCH_DEGREES
      })
    } catch {
      // An outage is not an answer. Reporting it as "no gravel here" would be
      // the survey's silence dressed up as its verdict.
      return { status: "unavailable", places: [] }
    }

    const places = collection.features
      .flatMap((feature): GroundedPlace[] => {
        const midpoint = featureMidpoint(feature)
        if (!midpoint) return []
        const county = feature.properties.county
        const miles = feature.properties.lengthMeters === null
          ? null
          : Math.round(feature.properties.lengthMeters / 160.934) / 10
        return [{
          placeId: `official-unpaved-${feature.properties.id}`,
          name: county ? `Unpaved road in ${county} County` : "Official unpaved road",
          kind: "road",
          lat: midpoint[1],
          lon: midpoint[0],
          detail: [
            PA_UNPAVED_ROADS_SURFACE_BOUNDARY,
            miles === null ? null : `${miles} mi segment`
          ].filter(Boolean).join(", "),
          citations: [officialSurveyCitation()]
        }]
      })
      .sort((left, right) =>
        haversine([left.lon, left.lat], anchor) - haversine([right.lon, right.lat], anchor))
      .slice(0, MAX_OFFICIAL_UNPAVED_PER_CALL)

    return { status: "ok", places }
  }

  const findRoads = async (
    args: Record<string, unknown>,
    input: AdviceRequest
  ): Promise<ToolResult> => {
    const queryRoads = options.queryRoads
    if (!queryRoads && !options.queryOfficialUnpaved) {
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
      segments = queryRoads?.({
        south: anchor[1] - ROAD_SEARCH_DEGREES,
        north: anchor[1] + ROAD_SEARCH_DEGREES,
        west: anchor[0] - ROAD_SEARCH_DEGREES,
        east: anchor[0] + ROAD_SEARCH_DEGREES,
        minScore: MIN_ROAD_SCORE,
        limit: 40
      }) ?? []
    } catch {
      return { content: { error: "Road character lookup was unavailable." }, places: [], citations: [] }
    }

    const wantsGravel = args.surface === "unpaved"
    const wantsPavement = args.surface === "paved"
    // A segment with no surface tag is not evidence of pavement, and its absence
    // from a gravel result is not evidence that no gravel is there. Filter on
    // what the dataset knows, and report the unknowns separately.
    const unknownSurfaceCount = segments.filter((segment) => surfaceClass(segment.surface) === "unknown").length
    const ranked = segments
      .filter((segment) => {
        const surface = surfaceClass(segment.surface)
        if (wantsPavement) return surface === "paved"
        if (wantsGravel) return surface === "unpaved"
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

    // Curvature and the PA survey are independent evidence sources. Never let a
    // zero-result or outage in one erase known surface evidence from the other.
    const official: OfficialGravelLookup = wantsGravel
      ? await officialGravelPlaces(anchor)
      : { status: "absent", places: [] }

    return {
      content: {
        roads: places.map((place, index) => ({
          placeId: place.placeId,
          name: place.name,
          surface: ranked[index]?.surface ?? "unknown",
          // Tri-state on purpose: null means this dataset does not say.
          unpaved: surfaceClass(ranked[index]?.surface ?? "unknown") === "unknown"
            ? null
            : surfaceClass(ranked[index]?.surface ?? "unknown") === "unpaved",
          curvatureScore: Math.round(ranked[index]?.score ?? 0),
          routeProgress: input.context ? routeProgressOf(place, input.context.geometry) : null
        })),
        ...(wantsGravel
          ? {
              officialSurvey: official.status,
              officialUnpavedRoads: official.places.map((place) => ({
                placeId: place.placeId,
                name: place.name,
                detail: place.detail,
                routeProgress: input.context ? routeProgressOf(place, input.context.geometry) : null
              }))
            }
          : {}),
        surfaceCoverage: {
          scoredRoadsNearby: segments.length,
          withoutSurfaceData: unknownSurfaceCount,
          ...(wantsGravel ? { officialUnpavedRoadsNearby: official.places.length } : {})
        },
        note: surfaceNote({
          returned: places.length,
          scoredNearby: segments.length,
          withoutSurfaceData: unknownSurfaceCount,
          wantsGravel,
          official
        })
      },
      places: [...places, ...official.places],
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
            "Turn a place name, town, or address into real coordinates OpenGravel can ride to. " +
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

      if (options.queryRoads || options.queryOfficialUnpaved) {
        definitions.push({
          name: "find_good_roads",
          description:
            "Find roads OpenGravel has actually scored as good riding near a point — curvature " +
            "score and mapped surface. Set surface to 'unpaved' to find gravel and dirt: that also " +
            `returns ${PA_UNPAVED_ROADS_PROVENANCE} survey features as additional historic surveyed/mapped unpaved surface evidence only. ` +
            "Neither source proves legal access, public access, current openness, passability, maintenance, closures, or other current conditions. One call per area is enough. " + where,
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
