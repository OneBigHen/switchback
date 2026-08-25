import { handleFreeRideSuggestions } from "./handler"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { buildFreeRideGraph, type FreeRideGraphIndex } from "@/lib/recommendation/free-ride-graph"
import { plannedRouteToScoreable } from "@/lib/recommendation/route-candidate"
import { requestGraphHopperRoutes } from "@/lib/routing/graphhopper"
import { createRateLimiter, withRateLimit } from "@/lib/server/rate-limiter"
import type { RouteRequest } from "@/lib/domain/contracts"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// The client polls this endpoint every 15s while Free Ride is active
// (~4 requests/min per rider), and each call can issue up to ~6 GraphHopper
// requests (buildGraphBackedFreeRideCandidates: baseline + detour per
// candidate). Unlike /api/routes, this endpoint had no per-caller limit at
// all — matching the same window/max /api/routes uses for the same class of
// provider-calling endpoint.
const requestLimiter = createRateLimiter({ windowMs: 60_000, max: 10, label: "free ride suggestion request" })

const MAX_GRAPH_FILE_BYTES = 64 * 1024 * 1024
let graphCache: { path: string; mtimeMs: number; size: number; graph: FreeRideGraphIndex } | null = null

async function loadConfiguredGraph(): Promise<FreeRideGraphIndex | null> {
  const configuredPath = process.env.FREE_RIDE_RIG_PATH?.trim()
  if (!configuredPath) return null
  const graphPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/* turbopackIgnore: true */ process.cwd(), configuredPath)
  const metadata = await stat(graphPath)
  if (!metadata.isFile() || metadata.size > MAX_GRAPH_FILE_BYTES) {
    throw new Error("Free Ride RIG graph file is missing or too large")
  }
  if (graphCache?.path === graphPath && graphCache.mtimeMs === metadata.mtimeMs && graphCache.size === metadata.size) {
    return graphCache.graph
  }
  const document = JSON.parse(await readFile(graphPath, "utf8")) as unknown
  const graph = buildFreeRideGraph(document)
  graphCache = { path: graphPath, mtimeMs: metadata.mtimeMs, size: metadata.size, graph }
  return graph
}

async function requestFreeRideRoute(
  request: RouteRequest,
  options: { signal?: AbortSignal } = {}
) {
  if (!request.destination) throw new Error("Free Ride routes require a rejoin destination")
  const points = [
    { lat: request.origin[1], lon: request.origin[0], label: "Free Ride origin" },
    ...(request.via ?? []).map(([lon, lat], index) => ({ lat, lon, label: `RIG corridor anchor ${index + 1}` })),
    { lat: request.destination[1], lon: request.destination[0], label: "Free Ride rejoin" }
  ]
  const result = await requestGraphHopperRoutes({
    profile: request.profile,
    source: "free-ride",
    points
  }, {
    baseUrl: process.env.GRAPHHOPPER_URL ?? "http://127.0.0.1:8989",
    ...(options.signal ? { signal: options.signal } : {})
  })
  const route = result.routes[0]
  if (!route) throw new Error("The routing engine returned no Free Ride route")
  return plannedRouteToScoreable(route)
}

async function handleFreeRidePost(request: Request): Promise<Response> {
  let graph: FreeRideGraphIndex | null
  try {
    graph = await loadConfiguredGraph()
  } catch {
    return Response.json({
      error: {
        code: "FREE_RIDE_GRAPH_INVALID",
        message: "The configured Free Ride RIG graph could not be loaded."
      }
    }, { status: 503 })
  }
  return handleFreeRideSuggestions(request, { graph, routeProvider: requestFreeRideRoute })
}

export const POST = withRateLimit(requestLimiter, handleFreeRidePost)
