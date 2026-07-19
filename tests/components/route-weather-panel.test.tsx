import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RouteWeatherPanel } from "@/components/planner/RouteWeatherPanel"
import { requestRouteWeather } from "@/lib/client/weather-client"
import type { PlannedRoute } from "@/lib/routing/types"

vi.mock("@/lib/client/weather-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/client/weather-client")>()
  return { ...original, requestRouteWeather: vi.fn() }
})

afterEach(cleanup)

const route: PlannedRoute = {
  id: "weather-route",
  name: "Ridge weather route",
  profile: "scenic",
  geometry: [[-76.9, 40.1], [-76.7, 40.3], [-76.5, 40.5]],
  waypoints: [],
  instructions: [],
  distanceMiles: 42,
  durationMinutes: 78,
  ascentMeters: 200,
  descentMeters: 200,
  twistiness: 70,
  turnCount: 24,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

describe("route weather panel", () => {
  it("shows weather along the selected route and prioritizes active alerts", async () => {
    vi.mocked(requestRouteWeather).mockResolvedValue({
      source: "nws",
      samples: [{
        coordinate: { lat: 40.1, lon: -76.9 },
        location: { city: "Harrisburg", state: "PA" },
        status: "ok",
        forecastUpdatedAt: "2026-07-13T18:00:00Z",
        hourly: [{
          startTime: "2026-07-13T19:00:00Z",
          isDaytime: true,
          temperatureF: 78,
          precipitationChance: 35,
          windSpeedMph: 12,
          windDirection: "SW",
          shortForecast: "Scattered thunderstorms"
        }],
        alerts: [{
          id: "alert-1",
          event: "Severe Thunderstorm Watch",
          headline: "Storms possible along the ridge",
          severity: "Severe",
          urgency: "Expected",
          certainty: "Likely",
          onset: null,
          expires: null
        }],
        unavailable: []
      }]
    })

    render(<RouteWeatherPanel route={route} />)

    expect(await screen.findByRole("heading", { name: "Ride weather" })).toBeInTheDocument()
    expect(screen.getByText("78°")).toBeInTheDocument()
    expect(screen.getByText("35% rain")).toBeInTheDocument()
    expect(screen.getByText(/Severe Thunderstorm Watch/i)).toBeInTheDocument()
    expect(requestRouteWeather).toHaveBeenCalledWith(
      [{ lat: 40.1, lon: -76.9 }, { lat: 40.3, lon: -76.7 }, { lat: 40.5, lon: -76.5 }],
      fetch,
      expect.any(AbortSignal)
    )
  })
})
