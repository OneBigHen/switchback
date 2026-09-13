import { array, number, object_, safeParse } from "@/lib/validate"
import { BodyTooLargeError, readBoundedJsonBody } from "@/lib/server/http-body"
import type { RouteTrafficEvidence, TrafficRoutePoint } from "@/lib/traffic/types"

export type RouteTrafficProvider = (
  points: TrafficRoutePoint[]
) => Promise<RouteTrafficEvidence>

const requestSchema = object_({
  points: array(
    object_({
      lat: number({ min: -90, max: 90, finite: true }),
      lon: number({ min: -180, max: 180, finite: true })
    }, { strict: true }),
    { min: 2, max: 400 }
  )
}, { strict: true })

function json(body: unknown, status: number, cacheControl: string): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": cacheControl }
  })
}

export async function handleRouteTrafficRequest(
  request: Request,
  provider: RouteTrafficProvider
): Promise<Response> {
  let body: unknown
  try {
    body = await readBoundedJsonBody(request, 48 * 1024)
  } catch (caught) {
    if (caught instanceof BodyTooLargeError) {
      return json({
        error: {
          code: "ROUTE_TRAFFIC_REQUEST_TOO_LARGE",
          message: "That traffic request is too large."
        }
      }, 413, "no-store")
    }
    body = null
  }

  const parsed = safeParse(requestSchema, body)
  if (!parsed.success) {
    return json({
      error: {
        code: "INVALID_ROUTE_TRAFFIC_REQUEST",
        message: "Provide between two and 400 valid route coordinates."
      }
    }, 400, "no-store")
  }

  try {
    const evidence = await provider(parsed.data.points)
    return json(evidence, 200, "private, no-store")
  } catch {
    return json({
      error: {
        code: "ROUTE_TRAFFIC_UNAVAILABLE",
        message: "Route traffic is temporarily unavailable."
      }
    }, 503, "no-store")
  }
}
