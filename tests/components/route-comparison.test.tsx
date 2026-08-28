import { useState } from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
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
  it("keeps the route-quality score out of the choice layer and available in preparation details", async () => {
    const user = userEvent.setup()
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

    expect(screen.queryByText("Route quality 87/100")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Show route details" }))
    expect(screen.getByText("Route quality 87/100")).toBeInTheDocument()
  })

  it("separates the preparation toggle label from its supporting summary", async () => {
    const user = userEvent.setup()
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

    const toggle = screen.getByRole("button", { name: "Show route details" })
    await user.click(toggle)

    expect(toggle.textContent).toMatch(/Hide preparation\s+Weather, surface, route evidence, offline limits, and export/)
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
    expect(screen.getByText(/72% secondary/i)).toBeInTheDocument()
    expect(screen.getAllByText(/44% unpaved/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/1.4% official PA unpaved/i)).toBeInTheDocument()
    expect(screen.getByText(/most curves and direction changes/i)).toBeInTheDocument()
    expect(screen.getByText(/lowest travel time/i)).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Why this route was chosen" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Show route details" }))
    expect(screen.getByRole("region", { name: "Why this route was chosen" })).toHaveTextContent("Traffic and closures")
    const routeCharacter = within(screen.getByLabelText("Route character"))
    expect(routeCharacter.getByText("Why this route")).toBeVisible()
    expect(routeCharacter.getByText("Mostly secondary roads (72%).")).toBeVisible()
    expect(screen.queryByRole("img", { name: "Appalachian ridge road overlook" })).not.toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "Roadside motorcycle coffee stop" })).not.toBeInTheDocument()

    const directionsButton = screen.getByRole("button", { name: /Show turn-by-turn directions/i })
    expect(directionsButton).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("region", { name: /turn-by-turn directions/i })).not.toBeInTheDocument()

    await user.click(directionsButton)
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

  it("does not imply a selected route before the rider taps one", async () => {
    const user = userEvent.setup()
    const onRide = vi.fn()
    function Harness() {
      const [selectedId, setSelectedId] = useState("")
      return (
        <RouteComparison
          routes={routes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSave={vi.fn()}
          onExport={vi.fn()}
          onRide={onRide}
        />
      )
    }
    render(
      <Harness />
    )

    expect(screen.getByRole("status")).toHaveTextContent("Choose a route above")
    expect(screen.queryByText("Selected route")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Start ride" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: `Select ${routes[1].name}` }))
    expect(screen.getByRole("button", { name: `Select ${routes[1].name}` })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText(routes[1].name, { selector: ".route-selection-identity strong" })).toBeInTheDocument()
    expect(screen.getByText("Selected route")).toBeInTheDocument()
  })

  it("scrolls selected route controls into the planner viewport", async () => {
    const user = userEvent.setup()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView })
    function Harness() {
      const [selectedId, setSelectedId] = useState("")
      return (
        <RouteComparison
          routes={routes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSave={vi.fn()}
          onExport={vi.fn()}
          onRide={vi.fn()}
        />
      )
    }

    try {
      render(<Harness />)
      await user.click(screen.getByRole("button", { name: `Select ${routes[0].name}` }))
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" })
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: originalScrollIntoView })
      } else {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: undefined })
      }
    }
  })

  it("formats short turn distances in feet for imperial riders and meters for metric riders", async () => {
    const user = userEvent.setup()
    const route = {
      ...routes[0],
      instructions: [{
        distanceMeters: 100,
        timeMilliseconds: 60_000,
        sign: -2,
        text: "Turn left",
        streetName: "Ridge Road",
        interval: [0, 1] as [number, number]
      }]
    }
    window.localStorage.setItem("switchback:rider-settings", JSON.stringify({ version: 1, units: "imperial", bikes: [], activeBikeId: "" }))
    const { unmount } = render(<RouteComparison routes={[route]} selectedId={route.id} onSelect={vi.fn()} onSave={vi.fn()} onExport={vi.fn()} onRide={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Show turn-by-turn directions" }))
    expect(screen.getByText("330 ft")).toBeInTheDocument()

    unmount()
    window.localStorage.setItem("switchback:rider-settings", JSON.stringify({ version: 1, units: "metric", bikes: [], activeBikeId: "" }))
    render(<RouteComparison routes={[route]} selectedId={route.id} onSelect={vi.fn()} onSave={vi.fn()} onExport={vi.fn()} onRide={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Show turn-by-turn directions" }))
    expect(screen.getByText("100 m")).toBeInTheDocument()
    window.localStorage.removeItem("switchback:rider-settings")
  })

  it("shows an unavailable surface state instead of a bare zero", () => {
    render(<RouteComparison routes={[{ ...routes[0], surfaceMix: {} }]} selectedId={routes[0]!.id} onSelect={vi.fn()} onSave={vi.fn()} onExport={vi.fn()} onRide={vi.fn()} />)

    expect(screen.getByText("Surface data unavailable")).toBeInTheDocument()
    expect(screen.queryByText("0% unpaved")).not.toBeInTheDocument()
    expect(screen.queryByText(/0% non-paved mix/)).not.toBeInTheDocument()
  })

  it("uses the saved metric setting for route distance and unknown-surface tradeoffs", () => {
    window.localStorage.setItem("switchback:rider-settings", JSON.stringify({ version: 1, units: "metric", bikes: [], activeBikeId: "" }))
    render(<RouteComparison routes={[{ ...routes[0], surfaceMix: { asphalt: 80, unknown: 20 } }]} selectedId={routes[0]!.id} onSelect={vi.fn()} onSave={vi.fn()} onExport={vi.fn()} onRide={vi.fn()} />)

    expect(screen.getByText("45.7")).toBeInTheDocument()
    expect(screen.getByText(/9.1 km unknown surface/i)).toBeInTheDocument()
    expect(screen.queryByText("28.4")).not.toBeInTheDocument()
    window.localStorage.removeItem("switchback:rider-settings")
  })

  it("does not turn an unknown-only surface mix into a measured zero", () => {
    render(<RouteComparison routes={[{ ...routes[0], surfaceMix: { unknown: 100 } }]} selectedId={routes[0]!.id} onSelect={vi.fn()} onSave={vi.fn()} onExport={vi.fn()} onRide={vi.fn()} />)

    expect(screen.getAllByText("Surface data unavailable").length).toBeGreaterThan(0)
    expect(screen.queryByText("0% unpaved")).not.toBeInTheDocument()
  })

  it("turns internal route score explanations into grounded rider copy", async () => {
    const user = userEvent.setup()
    const route = {
      ...routes[0],
      routeScore: {
        ...routes[0]!.routeScore!,
        explanations: [
          "Road segment scenic-1-9t484x:aggregate has unknown legal access.",
          "Road segment scenic-1-9t484x:aggregate has unknown current closure status.",
          "Scenic road character measures 86/100."
        ]
      }
    }
    render(<RouteComparison routes={[route]} selectedId={route.id} onSelect={vi.fn()} onSave={vi.fn()} onExport={vi.fn()} onRide={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Show route details" }))
    expect(within(screen.getByLabelText("Route character")).getByText("Why this route")).toBeVisible()
    const why = screen.getByRole("note", { name: "Why this route scored well" })
    expect(why).toHaveTextContent("Mostly secondary roads (72%).")
    expect(why).not.toHaveTextContent("scenic-1-9t484x:aggregate")
    expect(why).not.toHaveTextContent("unknown legal access")
  })
})
