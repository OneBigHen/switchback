import { describe, expect, it, vi } from "vitest"
import { handleRouteWeatherRequest } from "@/app/api/route-weather/handler"
import type { RouteWeatherResponse } from "@/lib/weather/types"

const weather: RouteWeatherResponse = {
  source: "nws",
  samples: [
    {
      coordinate: { lat: 40.2, lon: -76.9 },
      location: { city: "Lancaster", state: "PA" },
      status: "ok",
      forecastUpdatedAt: "2026-07-13T18:00:00+00:00",
      hourly: [],
      alerts: [],
      unavailable: []
    }
  ]
}

function request(body: unknown): Request {
  return new Request("http://switchback.test/api/route-weather", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })
}

describe("route weather API", () => {
  it("returns route weather with a private five-minute cache policy", async () => {
    const provider = vi.fn(async (): Promise<RouteWeatherResponse> => weather)
    const response = await handleRouteWeatherRequest(request({
      points: [{ lat: 40.2, lon: -76.9 }]
    }), provider)

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, max-age=300, stale-while-revalidate=600")
    expect(await response.json()).toEqual(weather)
    expect(provider).toHaveBeenCalledWith([{ lat: 40.2, lon: -76.9 }])
  })

  it("rejects routes with more than three weather samples", async () => {
    const provider = vi.fn(async (): Promise<RouteWeatherResponse> => weather)
    const response = await handleRouteWeatherRequest(request({
      points: [
        { lat: 40.1, lon: -76.1 },
        { lat: 40.2, lon: -76.2 },
        { lat: 40.3, lon: -76.3 },
        { lat: 40.4, lon: -76.4 }
      ]
    }), provider)

    expect(response.status).toBe(400)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_ROUTE_WEATHER_REQUEST" }
    })
    expect(provider).not.toHaveBeenCalled()
  })

  it("rejects coordinates outside geographic bounds", async () => {
    const provider = vi.fn(async (): Promise<RouteWeatherResponse> => weather)
    const response = await handleRouteWeatherRequest(request({
      points: [{ lat: 91, lon: -181 }]
    }), provider)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_ROUTE_WEATHER_REQUEST" }
    })
    expect(provider).not.toHaveBeenCalled()
  })

  it("returns a safe unavailable response when the provider cannot run", async () => {
    const provider = vi.fn(async (): Promise<RouteWeatherResponse> => {
      throw new Error("provider details that should not leak")
    })
    const response = await handleRouteWeatherRequest(request({
      points: [{ lat: 40.2, lon: -76.9 }]
    }), provider)

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      error: {
        code: "ROUTE_WEATHER_UNAVAILABLE",
        message: "Route weather is temporarily unavailable."
      }
    })
  })
})
