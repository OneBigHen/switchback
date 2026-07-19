import { number, object_, array, safeParse } from "@/lib/validate"
import type { RouteWeatherCoordinate, RouteWeatherResponse } from "@/lib/weather/types"

export type RouteWeatherProvider = (
  points: RouteWeatherCoordinate[]
) => Promise<RouteWeatherResponse>

const requestSchema = object_({
  points: array(
    object_({
      lat: number({ min: -90, max: 90 }),
      lon: number({ min: -180, max: 180 })
    }, { strict: true }),
    { min: 1, max: 3 }
  )
}, { strict: true })

function json(body: unknown, status: number, cacheControl: string): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": cacheControl }
  })
}

export async function handleRouteWeatherRequest(
  request: Request,
  provider: RouteWeatherProvider
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const parsed = safeParse(requestSchema, body)
  if (!parsed.success) {
    return json({
      error: {
        code: "INVALID_ROUTE_WEATHER_REQUEST",
        message: "Provide between one and three valid route coordinates."
      }
    }, 400, "no-store")
  }

  try {
    const weather = await provider(parsed.data.points)
    return json(weather, 200, "private, max-age=300, stale-while-revalidate=600")
  } catch {
    return json({
      error: {
        code: "ROUTE_WEATHER_UNAVAILABLE",
        message: "Route weather is temporarily unavailable."
      }
    }, 503, "no-store")
  }
}
