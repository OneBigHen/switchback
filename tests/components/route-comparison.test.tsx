import { useState } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RouteComparison } from "@/components/planner/RouteComparison"
import type { PlannedRoute } from "@/lib/routing/types"
import type { TripPlan } from "@/lib/trip/trip-plan"

const routes: PlannedRoute[] = [
  {
    id: "twisty-1",
    name: "Twisty route",
    profile: "twisty",
    geometry: [[-76.8, 40.2], [-76.7, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 28.4,
    durationMinutes: 51,
    ascentMeters: 410,
    descentMeters: 390,
    twistiness: 82,
    turnCount: 33,
    roadMix: { secondary: 72, primary: 28 },
    surfaceMix: { asphalt: 56, gravel: 32, dirt: 12 },
    routingSource: "live",
    previewOnly: false,
    routeScore: {
      total: 87,
      fun: 90,
      twistiness: 92,
      scenic: 72,
      elevation: 64,
      gravel: 18,
      traffic: 84,
      simplicity: 78,
      safety: 96,
      novelty: 68,
      confidence: 90,
      preferenceFit: 83,
      etaPenalty: 8,
      explanations: ["Strong curvature and sustained bends."],
      explanation: ["Strong curvature and sustained bends."]
    },
    overlapPercent: 100,
    officialUnpavedEvidence: {
      source: "Pennsylvania Department of Environmental Protection",
      dataset: "Unpaved Roads 2009_07",
      matchedMeters: 640,
      sharePercent: 1.4,
      matchedFeatureCount: 2,
      matchRadiusMeters: 40,
      minimumContiguousMeters: 80
    }
  },
  {
    id: "quick-1",
    name: "Quick route",
    profile: "quick",
    geometry: [[-76.8, 40.2], [-76.6, 40.25]],
    waypoints: [],
    instructions: [],
    distanceMiles: 24.1,
    durationMinutes: 37,
    ascentMeters: 210,
    descentMeters: 200,
    twistiness: 41,
    turnCount: 12,
    roadMix: { primary: 63, secondary: 37 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    previewOnly: false,
    overlapPercent: 68
  }
]

afterEach(cleanup)

describe("route comparison rack", () => {
  it("shows the normalized route-quality score beside route comparison metrics", () => {
    render(
      <RouteComparison
        routes={[routes[0]]}
        selectedId="twisty-1"
        onSelect={vi.fn()}
        onSave={vi.fn()}
        onExport={vi.fn()}
        onRide={vi.fn()}
      />
    )

    expect(screen.getByLabelText("Route quality score 87")).toBeInTheDocument()
  })

  it("shows route choices first and keeps long-form telemetry behind an explicit details action", async () => {
    const user = userEvent.setup()
    render(
      <RouteComparison
        routes={routes}
        selectedId="twisty-1"
        onSelect={vi.fn()}
        onSave={vi.fn()}
        onExport={vi.fn()}
        onRide={vi.fn()}
      />
    )

    expect(screen.getByRole("heading", { name: "Choose a route" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show route details" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Why this route was chosen" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Show route details" }))
    expect(screen.getByRole("region", { name: "Why this route was chosen" })).toBeInTheDocument()
  })

  it("turns the selected route into conservative, editable day-stage guidance", async () => {
    const user = userEvent.setup()
    render(
      <RouteComparison
        routes={[{ ...routes[0], distanceMiles: 420, durationMinutes: 720 }]}
        selectedId="twisty-1"
        onSelect={vi.fn()}
        onSave={vi.fn()}
        onExport={vi.fn()}
        onRide={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "Show route details" }))
    await user.click(screen.getByRole("button", { name: /stage this trip/i }))
    expect(screen.getByLabelText("Daily ride minutes")).toHaveValue(300)
    expect(screen.getAllByText(/Day [123]/)).toHaveLength(3)
    await user.clear(screen.getByLabelText("Fuel range miles"))
    await user.type(screen.getByLabelText("Fuel range miles"), "100")
    expect(screen.getAllByText(/fuel window/i).length).toBeGreaterThan(0)
  })

  it("restores saved stage constraints and overnight notes before the rider edits them", async () => {
    const user = userEvent.setup()
    const route = { ...routes[0], distanceMiles: 420, durationMinutes: 720 }
    const restoredTrip: TripPlan = {
      version: 2,
      id: "trip-restored",
      routeId: route.id,
      name: route.name,
      route,
      constraints: { targetDayMinutes: 240, fuelRangeMiles: 115, fuelReserveMiles: 20, breakEveryMinutes: 75, daylightMinutes: 210 },
      stages: [
        { id: "stage-1", label: "Day 1", startMile: 0, endMile: 140, distanceMiles: 140, durationMinutes: 240, start: { lat: 40.2, lon: -76.8 }, finish: { lat: 40.25, lon: -76.7 }, fuelStops: [], breaks: [], overnightLabel: "Pine Creek Lodge" },
        { id: "stage-2", label: "Day 2", startMile: 140, endMile: 280, distanceMiles: 140, durationMinutes: 240, start: { lat: 40.25, lon: -76.7 }, finish: { lat: 40.3, lon: -76.6 }, fuelStops: [], breaks: [] },
        { id: "stage-3", label: "Day 3", startMile: 280, endMile: 420, distanceMiles: 140, durationMinutes: 240, start: { lat: 40.3, lon: -76.6 }, finish: { lat: 40.35, lon: -76.5 }, fuelStops: [], breaks: [] }
      ],
      warnings: [],
      createdAt: "2026-07-18T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z"
    }
    render(
      <RouteComparison routes={[route]} selectedId={route.id} onSelect={vi.fn()} onSave={vi.fn()} onExport={vi.fn()} onRide={vi.fn()} savedTrip={restoredTrip} />
    )

    await user.click(screen.getByRole("button", { name: "Show route details" }))
    await user.click(screen.getByRole("button", { name: /stage this trip/i }))
    expect(screen.getByLabelText("Daily ride minutes")).toHaveValue(240)
    expect(screen.getByLabelText("Overnight stop for Day 1")).toHaveValue("Pine Creek Lodge")
  })

  it("records an explicit rating per motorcycle instead of inferring a hidden preference", async () => {
    const user = userEvent.setup()
    const onRate = vi.fn()
    render(
      <RouteComparison
        routes={[routes[0]]}
        selectedId="twisty-1"
        onSelect={vi.fn()}
        onSave={vi.fn()}
        onExport={vi.fn()}
        onRide={vi.fn()}
        onRate={onRate}
      />
    )

    await user.click(screen.getByRole("button", { name: "Show route details" }))
    // The bike identity comes from settings (SB-011): the rating passes the
    // stable default bike id, and the UI shows the bike name read-only.
    expect(screen.getByText(/Bike:/)).toBeInTheDocument()
    expect(screen.queryByLabelText("Motorcycle name")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Rate route 5 out of 5" }))
    expect(onRate).toHaveBeenCalledWith(routes[0], "bike-default-street", 5)
  })

  it("shows rider metrics and sends actions the actively selected route", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onExport = vi.fn()
    const onRide = vi.fn()

    function Harness() {
      const [selectedId, setSelectedId] = useState(routes[0].id)
      return (
        <RouteComparison
          routes={routes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSave={onSave}
          onExport={onExport}
          onRide={onRide}
        />
      )
    }

    render(<Harness />)

    expect(screen.getByText("28.4")).toBeInTheDocument()
    expect(screen.getByText("82")).toBeInTheDocument()
    expect(screen.getByText(/72% secondary/i)).toBeInTheDocument()
    expect(screen.getAllByText(/44% unpaved/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/1.4% official PA unpaved/i)).toBeInTheDocument()
    expect(screen.getByText(/most curves and direction changes/i)).toBeInTheDocument()
    expect(screen.getByText(/lowest travel time/i)).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Why this route was chosen" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Show route details" }))
    expect(screen.getByRole("region", { name: "Why this route was chosen" })).toHaveTextContent("Traffic and closures")
    expect(screen.getByRole("img", { name: "Appalachian ridge road overlook" })).toBeVisible()
    expect(screen.getByRole("img", { name: "Roadside motorcycle coffee stop" })).toBeVisible()

    const directionsButton = screen.getByRole("button", { name: /Hide turn-by-turn directions/i })
    expect(directionsButton).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("region", { name: /turn-by-turn directions/i })).toHaveTextContent(
      "No turn instructions are available for this route."
    )

    await user.click(directionsButton)
    expect(screen.queryByRole("region", { name: /turn-by-turn directions/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /select quick route/i }))
    await user.click(screen.getByRole("button", { name: /save route/i }))
    await user.click(screen.getByRole("button", { name: /export gpx/i }))
    await user.click(screen.getByRole("button", { name: /start ride/i }))

    expect(onSave).toHaveBeenCalledWith(routes[1])
    expect(onExport).toHaveBeenCalledWith(routes[1], "track")
    expect(onRide).toHaveBeenCalledWith(routes[1])
  })
})
