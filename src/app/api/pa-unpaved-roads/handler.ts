import {
  normalizePaUnpavedRoadQuery,
  PA_UNPAVED_ROADS_MAX_FEATURES
} from "@/lib/roads/pa-unpaved"
import type {
  PaUnpavedRoadFeatureCollection,
  PaUnpavedRoadQuery
} from "@/lib/roads/types"

const SUCCESS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
const INVALID_MESSAGE = "Use a valid, zoomed-in Pennsylvania map view."
const UNAVAILABLE_MESSAGE =
  "Official Pennsylvania unpaved-road data is temporarily unavailable."

export type PaUnpavedRoadFetcher = (
  query: PaUnpavedRoadQuery
) => Promise<PaUnpavedRoadFeatureCollection>

export async function handlePaUnpavedRoadsRequest(
  request: Request,
  provider: PaUnpavedRoadFetcher
): Promise<Response> {
  const query = readMapQuery(new URL(request.url).searchParams)
  if (query === null) return invalidQueryResponse()

  try {
    const collection = await provider(query)
    return Response.json(collection, {
      headers: { "cache-control": SUCCESS_CACHE_CONTROL }
    })
  } catch {
    return Response.json(
      {
        error: {
          code: "PA_UNPAVED_ROADS_UNAVAILABLE",
          message: UNAVAILABLE_MESSAGE
        }
      },
      {
        status: 503,
        headers: { "cache-control": "no-store" }
      }
    )
  }
}

function readMapQuery(searchParams: URLSearchParams): PaUnpavedRoadQuery | null {
  const bbox = searchParams.get("bbox")?.split(",")
  const zoom = readNumber(searchParams.get("zoom"))
  const requestedLimit = searchParams.has("limit")
    ? readNumber(searchParams.get("limit"))
    : 200

  if (
    bbox?.length !== 4 ||
    zoom === null || zoom < 9 || zoom > 24 ||
    requestedLimit === null || !Number.isInteger(requestedLimit) || requestedLimit < 1
  ) {
    return null
  }

  const coordinates = bbox.map(readNumber)
  if (coordinates.some((coordinate) => coordinate === null)) return null
  const [west, south, east, north] = coordinates as [number, number, number, number]

  try {
    return normalizePaUnpavedRoadQuery({
      bounds: { south, west, north, east },
      limit: Math.min(requestedLimit, PA_UNPAVED_ROADS_MAX_FEATURES)
    })
  } catch {
    return null
  }
}

function readNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function invalidQueryResponse(): Response {
  return Response.json(
    {
      error: {
        code: "INVALID_PA_UNPAVED_ROAD_QUERY",
        message: INVALID_MESSAGE
      }
    },
    {
      status: 400,
      headers: { "cache-control": "no-store" }
    }
  )
}
