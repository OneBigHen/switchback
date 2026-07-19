import { describe, expect, it, vi } from "vitest"
import { getRouteWeather } from "@/lib/weather/nws"

const baseUrl = "https://api.weather.test"
const userAgent = "Switchback tests (weather@example.test)"

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function pointPayload(forecastHourly: string, city = "Lancaster") {
  return {
    properties: {
      forecastHourly,
      relativeLocation: {
        properties: { city, state: "PA" }
      }
    }
  }
}

function hourlyPayload(count = 1) {
  return {
    properties: {
      updated: "2026-07-13T18:00:00+00:00",
      periods: Array.from({ length: count }, (_, index) => ({
        startTime: `2026-07-13T${String(index + 14).padStart(2, "0")}:00:00-04:00`,
        isDaytime: true,
        temperature: index === 0 ? 82 : 80,
        temperatureUnit: "F",
        probabilityOfPrecipitation: { value: index === 0 ? 25 : null },
        windSpeed: index === 0 ? "5 to 12 mph" : "8 mph",
        windDirection: "SW",
        shortForecast: index === 0 ? "Slight Chance Showers" : "Partly Sunny"
      }))
    }
  }
}

function alertsPayload(count = 1) {
  return {
    features: Array.from({ length: count }, (_, index) => ({
      id: `https://api.weather.test/alerts/${index + 1}`,
      properties: {
        event: index === 0 ? "Severe Thunderstorm Warning" : "Heat Advisory",
        headline: index === 0 ? "Severe Thunderstorm Warning issued for Lancaster County" : `Heat Advisory ${index}`,
        severity: index === 0 ? "Severe" : "Moderate",
        urgency: index === 0 ? "Immediate" : "Expected",
        certainty: "Likely",
        onset: "2026-07-13T18:15:00-04:00",
        expires: "2026-07-13T20:00:00-04:00"
      }
    }))
  }
}

describe("NWS route weather", () => {
  it("uses point discovery and normalizes bounded hourly weather and alerts", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url === `${baseUrl}/points/40.1235,-76.9877`) {
        return jsonResponse(pointPayload(`${baseUrl}/gridpoints/CTP/101,82/forecast/hourly`))
      }
      if (url === `${baseUrl}/gridpoints/CTP/101,82/forecast/hourly`) {
        return jsonResponse(hourlyPayload(14))
      }
      if (url === `${baseUrl}/alerts/active?point=40.1235%2C-76.9877`) {
        return jsonResponse(alertsPayload(8))
      }
      return new Response("not found", { status: 404 })
    })

    const result = await getRouteWeather(
      [{ lat: 40.123456, lon: -76.987654 }],
      { baseUrl, fetcher, timeoutMs: 500, userAgent }
    )

    expect(result.source).toBe("nws")
    expect(result.samples).toHaveLength(1)
    expect(result.samples[0]).toMatchObject({
      coordinate: { lat: 40.1235, lon: -76.9877 },
      location: { city: "Lancaster", state: "PA" },
      status: "ok",
      forecastUpdatedAt: "2026-07-13T18:00:00+00:00",
      unavailable: []
    })
    expect(result.samples[0].hourly[0]).toMatchObject({
      startTime: "2026-07-13T14:00:00-04:00",
      isDaytime: true,
      temperatureF: 82,
      precipitationChance: 25,
      windSpeedMph: 12,
      windDirection: "SW",
      shortForecast: "Slight Chance Showers"
    })
    expect(result.samples[0].alerts[0]).toMatchObject({
      id: "https://api.weather.test/alerts/1",
      event: "Severe Thunderstorm Warning",
      severity: "Severe",
      urgency: "Immediate",
      certainty: "Likely"
    })
    expect(result.samples[0].hourly).toHaveLength(12)
    expect(result.samples[0].alerts).toHaveLength(6)
    expect(fetcher).toHaveBeenCalledTimes(3)

    for (const [, init] of fetcher.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(headers.get("user-agent")).toBe(userAgent)
      expect(headers.get("accept")).toBe("application/geo+json")
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it("preserves usable alert data when one point forecast fails", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url === `${baseUrl}/points/40.1,-76.1`) {
        return new Response("forecast lookup unavailable", { status: 503 })
      }
      if (url === `${baseUrl}/alerts/active?point=40.1%2C-76.1`) {
        return jsonResponse(alertsPayload())
      }
      if (url === `${baseUrl}/points/40.2,-76.2`) {
        return jsonResponse(pointPayload(`${baseUrl}/gridpoints/CTP/102,83/forecast/hourly`, "York"))
      }
      if (url === `${baseUrl}/gridpoints/CTP/102,83/forecast/hourly`) {
        return jsonResponse(hourlyPayload())
      }
      if (url === `${baseUrl}/alerts/active?point=40.2%2C-76.2`) {
        return jsonResponse({ features: [] })
      }
      return new Response("not found", { status: 404 })
    })

    const result = await getRouteWeather(
      [{ lat: 40.1, lon: -76.1 }, { lat: 40.2, lon: -76.2 }],
      { baseUrl, fetcher, userAgent }
    )

    expect(result.samples).toHaveLength(2)
    expect(result.samples[0]).toMatchObject({
      status: "degraded",
      hourly: [],
      unavailable: ["forecast"],
      alerts: [{ event: "Severe Thunderstorm Warning" }]
    })
    expect(result.samples[1]).toMatchObject({
      status: "ok",
      location: { city: "York", state: "PA" },
      unavailable: [],
      alerts: []
    })
  })

  it("isolates complete network failure to the affected point", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("network unavailable")
    })

    const result = await getRouteWeather(
      [{ lat: 40.3, lon: -76.3 }],
      { baseUrl, fetcher, userAgent }
    )

    expect(result.samples).toEqual([
      {
        coordinate: { lat: 40.3, lon: -76.3 },
        location: null,
        status: "degraded",
        forecastUpdatedAt: null,
        hourly: [],
        alerts: [],
        unavailable: ["forecast", "alerts"]
      }
    ])
  })
})
