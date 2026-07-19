import type { Coordinate } from "@/lib/routing/types"
import type { RouteWeatherCoordinate, RouteWeatherResponse } from "@/lib/weather/types"

interface WeatherErrorPayload {
  error?: { message?: string }
}

export function sampleRouteWeatherPoints(geometry: Coordinate[]): RouteWeatherCoordinate[] {
  if (geometry.length === 0) return []
  const indices = [...new Set([0, Math.floor((geometry.length - 1) / 2), geometry.length - 1])]
  return indices.map((index) => ({
    lat: geometry[index][1],
    lon: geometry[index][0]
  }))
}

export async function requestRouteWeather(
  points: RouteWeatherCoordinate[],
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<RouteWeatherResponse> {
  let response: Response
  try {
    response = await fetcher("/api/route-weather", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ points }),
      signal
    })
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught
    throw new Error("Route weather is temporarily unavailable.")
  }

  let payload: RouteWeatherResponse | WeatherErrorPayload
  try {
    payload = await response.json() as RouteWeatherResponse | WeatherErrorPayload
  } catch {
    throw new Error("Route weather returned an unreadable response.")
  }
  if (!response.ok) {
    throw new Error((payload as WeatherErrorPayload).error?.message ?? "Route weather is temporarily unavailable.")
  }
  return payload as RouteWeatherResponse
}
