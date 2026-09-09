import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StrictMode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RouteWeatherPanel } from "@/components/planner/RouteWeatherPanel"
import { requestRouteWeather } from "@/lib/client/weather-client"
import type { PlannedRoute } from "@/lib/routing/types"

vi.mock("@/lib/client/weather-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/client/weather-client")>()
  return { ...original, requestRouteWeather: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.mocked(requestRouteWeather).mockReset()
})

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

function weatherWithAlert() {
  return {
    source: "nws" as const,
    samples: [{
      coordinate: { lat: 40.1, lon: -76.9 },
      location: { city: "Harrisburg", state: "PA" },
      status: "ok" as const,
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
  }
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
    // The alert and the headline conditions are visible without asking.
    expect(screen.getByText(/Severe Thunderstorm Watch/i)).toBeInTheDocument()
    expect(screen.getByText("78°")).toBeInTheDocument()
    // The per-location numbers are one tap away.
    await userEvent.click(screen.getByRole("button", { name: /hourly detail/i }))
    expect(screen.getByText("35% rain")).toBeInTheDocument()
    expect(requestRouteWeather).toHaveBeenCalledWith(
      [{ lat: 40.1, lon: -76.9 }, { lat: 40.3, lon: -76.7 }, { lat: 40.5, lon: -76.5 }],
      fetch,
      expect.any(AbortSignal)
    )
  })

  it("renders the replacement result after StrictMode aborts the first request", async () => {
    vi.mocked(requestRouteWeather)
      .mockRejectedValueOnce(new DOMException("The operation was aborted.", "AbortError"))
      .mockResolvedValueOnce({
        source: "nws",
        samples: [{
          coordinate: { lat: 40.1, lon: -76.9 },
          location: { city: "Harrisburg", state: "PA" },
          status: "ok",
          forecastUpdatedAt: "2026-07-13T18:00:00Z",
          hourly: [{
            startTime: "2026-07-13T19:00:00Z",
            isDaytime: true,
            temperatureF: 64,
            precipitationChance: 10,
            windSpeedMph: 7,
            windDirection: "W",
            shortForecast: "Clear"
          }],
          alerts: [],
          unavailable: []
        }]
      })

    render(<StrictMode><RouteWeatherPanel route={route} /></StrictMode>)

    await waitFor(() => expect(requestRouteWeather).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole("heading", { name: "Ride weather" })).toBeInTheDocument()
    expect(screen.getByText("64°")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Retry weather" })).not.toBeInTheDocument()
  })

  it("keeps a permanent weather failure visible for recovery", async () => {
    vi.mocked(requestRouteWeather).mockRejectedValueOnce(new Error("Route weather is temporarily unavailable."))

    render(<RouteWeatherPanel route={route} />)

    expect(await screen.findByText("Route weather is temporarily unavailable.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry weather" })).toBeInTheDocument()
  })

  /**
   * An alert is a go/no-go fact and stays visible. The per-location detail —
   * temperature, conditions, rain chance, wind — is reference material, and a
   * wall of it is what made `Prepare ride` a feature inventory.
   *
   * The fetch deliberately stays eager. You cannot know whether an alert exists
   * without asking, so the request is the price of the warning being primary
   * (PREPARE-RIDE-AUDIT.md, Hazard 1).
   */
  it("keeps an alert visible while the per-location detail waits to be asked for", async () => {
    vi.mocked(requestRouteWeather).mockResolvedValue(weatherWithAlert())

    render(<RouteWeatherPanel route={route} />)

    // The warning elevates itself.
    expect(await screen.findByRole("alert")).toHaveTextContent("Severe Thunderstorm Watch")
    // The per-location cards do not. The summary still carries the headline
    // temperature, so the distinguishing content is the place and the wind.
    expect(screen.queryByText("Harrisburg")).not.toBeInTheDocument()
    expect(screen.queryByText(/12 mph SW/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /hourly detail/i }))
    expect(screen.getByText("Harrisburg")).toBeInTheDocument()
    expect(screen.getByText(/12 mph SW/)).toBeInTheDocument()
  })

  it("still asks for weather on mount, so an alert cannot go unseen", async () => {
    vi.mocked(requestRouteWeather).mockResolvedValue(weatherWithAlert())

    render(<RouteWeatherPanel route={route} />)

    await screen.findByRole("alert")
    // Nothing was clicked. Mounting the panel is what asks.
    expect(requestRouteWeather).toHaveBeenCalledTimes(1)
  })

  it("summarises the route without making the rider open anything", async () => {
    vi.mocked(requestRouteWeather).mockResolvedValue(weatherWithAlert())

    render(<RouteWeatherPanel route={route} />)

    // A collapsed panel still has to say something useful about the ride.
    expect(await screen.findByTestId("route-weather-summary")).toHaveTextContent("78°")
  })
})
