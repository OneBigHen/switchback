import type { RouteProvider } from "@/lib/routing/planner"
import { planMotorcycleTrip } from "@/lib/routing/planner"
import { GraphHopperProviderError } from "@/lib/routing/graphhopper"
import { z } from "zod"

const waypointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  label: z.string().trim().max(160).optional()
})

const routeRequestSchema = z.object({
  profile: z.enum(["quick", "twisty", "scenic", "adventure"]),
  compare: z.boolean().optional().default(true),
  points: z.array(waypointSchema).min(2).max(8)
})

const MAX_ROUTE_REQUEST_BYTES = 16 * 1024

async function readRoutePayload(
  request: Request
): Promise<{ payload: unknown } | { invalid: true } | { tooLarge: true }> {
  const declaredLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ROUTE_REQUEST_BYTES) {
    return { tooLarge: true }
  }

  if (!request.body) return { invalid: true }
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let body = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytesRead += value.byteLength
      if (bytesRead > MAX_ROUTE_REQUEST_BYTES) {
        await reader.cancel()
        return { tooLarge: true }
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    return { payload: JSON.parse(body) }
  } catch {
    return { invalid: true }
  }
}

export async function handleRouteRequest(
  request: Request,
  provider: RouteProvider
): Promise<Response> {
  const body = await readRoutePayload(request)
  if ("tooLarge" in body) {
    return errorResponse(
      "ROUTE_REQUEST_TOO_LARGE",
      "The route request is too large.",
      413
    )
  }
  if ("invalid" in body) {
    return errorResponse(
      "INVALID_ROUTE_REQUEST",
      "The route request must be valid JSON.",
      400
    )
  }

  const parsed = routeRequestSchema.safeParse(body.payload)
  if (!parsed.success) {
    return errorResponse(
      "INVALID_ROUTE_REQUEST",
      "Choose a motorcycle profile and provide between two and eight valid waypoints.",
      400,
      parsed.error.flatten()
    )
  }

  try {
    const trip = await planMotorcycleTrip(parsed.data, provider)
    return Response.json(trip)
  } catch (error) {
    if (error instanceof GraphHopperProviderError) {
      return errorResponse(error.code, error.message, normalizeStatus(error.status))
    }
    const message = error instanceof Error ? error.message : "The route could not be planned."
    return errorResponse("ROUTE_PLANNING_FAILED", message, 500)
  }
}

function normalizeStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 500
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown
): Response {
  return Response.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  )
}
