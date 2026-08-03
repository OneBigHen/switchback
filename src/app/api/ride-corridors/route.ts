import { number, enum_, object_, safeParse, string } from "@/lib/validate"
import { adviseCorridors } from "@/lib/ai/corridor-adviser"
import { createCorridorCache, corridorCacheKey } from "@/lib/server/corridor-cache"
import { searchPlaces } from "@/lib/geocoding/photon"
import type { Waypoint } from "@/lib/routing/types"
import path from "node:path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const waypointSchema = object_({
  lat: number({ finite: true, min: -90, max: 90 }),
  lon: number({ finite: true, min: -180, max: 180 }),
  label: string({ trim: true, min: 1, max: 160 })
})

const payloadSchema = object_({
  start: waypointSchema,
  finish: waypointSchema,
  targetMinutes: number({ int: true, min: 20, max: 480 }),
  character: enum_(["fun", "quick", "twisty", "scenic", "adventure", "balanced"] as const)
})

const cache = createCorridorCache(
  process.env.CORRIDOR_CACHE_PATH ?? path.join(process.cwd(), "data/route-research-cache.sqlite")
)

function geocodeAnchors(query: string) {
  const photonBaseUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io/api/"
  return searchPlaces(query, { baseUrl: photonBaseUrl })
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: { code: "INVALID_CORRIDOR_REQUEST", message: "Provide a start, finish, and ride duration." } }, { status: 400 })
  }
  const parsed = safeParse(payloadSchema, body)
  if (!parsed.success) {
    return Response.json({ error: { code: "INVALID_CORRIDOR_REQUEST", message: "Provide a valid start, finish, and ride duration." } }, { status: 400 })
  }

  const apiKey = process.env.YOU_API_KEY
  if (!apiKey?.trim()) {
    return Response.json({ hints: [], status: "no-key" })
  }

  const input = {
    start: parsed.data.start as Waypoint,
    finish: parsed.data.finish as Waypoint,
    targetMinutes: parsed.data.targetMinutes,
    character: parsed.data.character
  }

  const cacheKey = corridorCacheKey(input)
  const cached = cache.get(cacheKey)
  if (cached) {
    return Response.json({ hints: cached, status: "ok", cached: true })
  }

  const result = await adviseCorridors(input, {
    apiKey,
    signal: request.signal,
    geocode: geocodeAnchors
  })

  if (result.hints.length > 0) cache.set(cacheKey, result.hints)
  return Response.json({ hints: result.hints, status: result.status })
}
