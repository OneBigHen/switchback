import { createGraphHopperRequest } from "@/lib/routing/graphhopper"
import { roadMatchFromGraphHopperPayload, type RoadMatchRequestInput } from "@/lib/roads/road-matching"
import type { Coordinate } from "@/lib/routing/types"

interface RoadMatchingErrorPayload {
  error?: { code?: string; message?: string }
}

const MATCH_DETAILS = ["edge_id", "street_name", "road_class", "surface", "toll"]

async function readBody(request: Request): Promise<unknown | null> {
  try {
    const text = await request.text()
    if (text.length > 8 * 1024) return null
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function isFiniteLonLat(value: unknown): value is { lat: number; lon: number } {
  if (typeof value !== "object" || value === null) return false
  const { lat, lon } = value as { lat?: unknown; lon?: unknown }
  return typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90
    && typeof lon === "number" && Number.isFinite(lon) && lon >= -180 && lon <= 180
}

/**
 * Graph-matches two anchor points onto the live routing graph (SB-013):
 * the browser sends entry/exit, the server asks GraphHopper for a legal
 * motorcycle route between them with edge/street details, and the result is
 * a MatchedRoadRequirement-ready payload (real geometry + edge ids). A
 * refusal (no legal path, out of coverage) is a typed error, never a
 * straight-line placeholder.
 */
export async function handleRoadMatchingRequest(
  request: Request,
  graphHopperBaseUrl: string,
  now = new Date().toISOString()
): Promise<Response> {
  void now
  const body = await readBody(request)
  if (!body || typeof body !== "object") {
    return Response.json({ error: { code: "INVALID_MATCH_REQUEST", message: "Road matching needs entry and exit points." } }, { status: 400 })
  }
  const { start, end } = body as { start?: unknown; end?: unknown }
  if (!isFiniteLonLat(start) || !isFiniteLonLat(end)) {
    return Response.json({ error: { code: "INVALID_MATCH_REQUEST", message: "Entry and exit must be valid coordinates." } }, { status: 400 })
  }
  const input: RoadMatchRequestInput = {
    start: { lat: start.lat, lon: start.lon, label: "Matched entry" },
    end: { lat: end.lat, lon: end.lon, label: "Matched exit" },
    profile: typeof (body as Record<string, unknown>).profile === "string"
      ? (body as Record<string, unknown>).profile as string
      : "twisty",
    ...((body as Record<string, unknown>).avoidHighways === true ? { avoidHighways: true } : {})
  }
  const rawBike = (body as Record<string, unknown>).bikeProfile
  if (rawBike && typeof rawBike === "object") {
    input.bikeProfile = rawBike as RoadMatchRequestInput["bikeProfile"]
  }

  const entry: Coordinate = [start.lon, start.lat]
  const exit: Coordinate = [end.lon, end.lat]
  const graphHopperBody = createGraphHopperRequest({
    profile: input.profile as never,
    points: [
      { lat: start.lat, lon: start.lon, label: "Matched entry" },
      { lat: end.lat, lon: end.lon, label: "Matched exit" }
    ],
    ...(input.bikeProfile ? {
      bikeProfile: {
        name: "Matched bike",
        category: input.bikeProfile.category as never,
        fuelRangeMiles: 180,
        reserveMiles: 35,
        allowMaintainedGravel: input.bikeProfile.allowMaintainedGravel,
        allowRoughTracks: input.bikeProfile.allowRoughTracks,
        avoidUnknownSurface: input.bikeProfile.avoidUnknownSurface
      }
    } : {}),
    ...(input.avoidHighways ? { avoidHighways: true } : {})
  }, MATCH_DETAILS)

  let response: Response
  try {
    response = await fetch(`${graphHopperBaseUrl.replace(/\/$/, "")}/route`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(graphHopperBody),
      signal: AbortSignal.timeout(20_000)
    })
  } catch {
    return Response.json({ error: { code: "ROUTER_UNREACHABLE", message: "The routing service is not reachable right now." } }, { status: 503 })
  }

  const payload = await response.json().catch(() => null) as RoadMatchingErrorPayload | { paths?: unknown; info?: unknown } | null
  if (!response.ok || !payload || !("paths" in payload)) {
    const message = payload && "error" in payload && payload.error?.message
      ? payload.error.message
      : "No legal motorcycle path could be matched between these points."
    const code = !response.ok && payload && "error" in payload && payload.error?.code
      ? payload.error.code
      : "MATCH_UNAVAILABLE"
    return Response.json({ error: { code, message } }, { status: response.ok ? 422 : response.status })
  }

  const matched = roadMatchFromGraphHopperPayload(payload as Parameters<typeof roadMatchFromGraphHopperPayload>[0], entry, exit)
  if (!matched) {
    return Response.json({ error: { code: "MATCH_UNAVAILABLE", message: "The router returned no usable geometry for these points." } }, { status: 422 })
  }
  return Response.json({ matched, matchedAt: new Date().toISOString() })
}
