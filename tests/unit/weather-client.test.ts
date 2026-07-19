import { describe, expect, it, vi } from "vitest"
import { requestRouteWeather, sampleRouteWeatherPoints } from "@/lib/client/weather-client"

describe("route weather client", () => {
  it("samples the start, midpoint, and end of a route", () => {
    expect(sampleRouteWeatherPoints([
      [-76.9, 40.1],
      [-76.8, 40.2],
      [-76.7, 40.3],
      [-76.6, 40.4],
      [-76.5, 40.5]
    ])).toEqual([
      { lat: 40.1, lon: -76.9 },
      { lat: 40.3, lon: -76.7 },
      { lat: 40.5, lon: -76.5 }
    ])
  })

  it("posts sampled route points to the same-origin weather endpoint", async () => {
    const payload = { source: "nws", samples: [] }
    const fetcher = vi.fn(async () => Response.json(payload))
    await expect(requestRouteWeather([{ lat: 40.1, lon: -76.9 }], fetcher)).resolves.toEqual(payload)
    expect(fetcher).toHaveBeenCalledWith("/api/route-weather", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ points: [{ lat: 40.1, lon: -76.9 }] })
    }))
  })

  it("uses a rider-safe error when weather is unavailable", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: "Weather is resting." } }, { status: 503 }))
    await expect(requestRouteWeather([{ lat: 40.1, lon: -76.9 }], fetcher)).rejects.toThrow("Weather is resting.")
  })
})
