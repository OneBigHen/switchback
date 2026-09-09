import { useState, type ComponentProps } from "react"
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

/**
 * Renders the way production does.
 *
 * `PlannerComposition` is the only caller and always passes
 * `showRouteChoices={false}`, so `RouteComparison` ships as route *details*.
 * Every test here used to omit the prop and get the `true` default, which
 * meant this file described a legacy chooser the app never renders — and the
 * shipped configuration had no component coverage at all.
 *
 * Sixteen duplicated prop lists are what let that drift go unnoticed, so the
 * default lives in one place now.
 */
function renderComparison(props: Partial<ComponentProps<typeof RouteComparison>> = {}) {
  return render(
    <RouteComparison
      routes={routes}
      selectedId={routes[0]!.id}
      onSelect={vi.fn()}
      onSave={vi.fn()}
      onExport={vi.fn()}
      onRide={vi.fn()}
      showRouteChoices={false}
      {...props}
    />
  )
}

describe("route comparison rack", () => {
  it("keeps the route-quality score out of the choice layer and available in preparation details", async () => {
    const user = userEvent.setup()
    renderComparison({ routes: [routes[0]] })

    expect(screen.queryByText("Route quality 87/100")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Show route details" }))
    expect(screen.getByText("Route quality 87/100")).toBeInTheDocument()
  })

  it("separates the preparation toggle label from its supporting summary", async () => {
    const user = userEvent.setup()
    renderComparison({ routes: [routes[0]] })

    const toggle = screen.getByRole("button", { name: "Show route details" })
    await user.click(toggle)

    expect(toggle.textContent).toMatch(/Hide preparation\s+Weather, surface, route evidence, offline limits, and export/)
  })

  it("keeps long-form telemetry behind an explicit details action", async () => {
    const user = userEvent.setup()
    renderComparison()

    expect(screen.getByRole("heading", { name: "Route details" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show route details" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Why this route was chosen" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Show route details" }))
    expect(screen.getByRole("region", { name: "Why this route was chosen" })).toBeInTheDocument()
  })

  it("turns the selected route into conservative, editable day-stage guidance", async () => {
    const user = userEvent.setup()
    renderComparison({ routes: [{ ...routes[0], distanceMiles: 420, durationMinutes: 720 }] })

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
    renderComparison({ routes: [route], selectedId: route.id, savedTrip: restoredTrip })

    await user.click(screen.getByRole("button", { name: "Show route details" }))
    await user.click(screen.getByRole("button", { name: /stage this trip/i }))
    expect(screen.getByLabelText("Daily ride minutes")).toHaveValue(240)
    expect(screen.getByLabelText("Overnight stop for Day 1")).toHaveValue("Pine Creek Lodge")
  })

  it("records an explicit rating per motorcycle instead of inferring a hidden preference", async () => {
    const user = userEvent.setup()
    const onRate = vi.fn()
    renderComparison({ routes: [routes[0]], onRate: onRate })

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

    // In production the decision rail owns selection and re-renders this
    // component with a new `selectedId`. The button stands in for that, so the
    // contract under test — actions follow the active route, never a stale one
    // — is exercised without the retired in-component chooser.
    function Harness() {
      const [selectedId, setSelectedId] = useState(routes[0]!.id)
      return (
        <>
          <button type="button" onClick={() => setSelectedId(routes[1]!.id)}>
            Rail selects {routes[1]!.name}
          </button>
          <RouteComparison
            routes={routes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onSave={onSave}
            onExport={onExport}
            onRide={onRide}
            showRouteChoices={false}
          />
        </>
      )
    }

    render(<Harness />)

    // The compact metric line, tradeoff copy and survey-overlap string all
    // belonged to the chooser's route slips, which this configuration does not
    // render. The same facts reach the rider through the evidence panel and
    // route character below, which is what production shows.
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

    await user.click(screen.getByRole("button", { name: `Rail selects ${routes[1]!.name}` }))
    await user.click(screen.getByRole("button", { name: /save route/i }))
    await user.click(screen.getByRole("button", { name: /export gpx/i }))
    await user.click(screen.getByRole("button", { name: /start ride/i }))

    expect(onSave).toHaveBeenCalledWith(routes[1])
    expect(onExport).toHaveBeenCalledWith(routes[1], "track")
    expect(onRide).toHaveBeenCalledWith(routes[1])
  })

    /*
   * "does not imply a selected route before the rider taps one" lived here.
   * PlannerComposition only mounts RouteComparison for an already-selected
   * route (`selectedId={selectedDetailsRoute.id}`), so the empty-selection
   * prompt it exercised is unreachable in production. The contract it stood
   * for — never present a selection the rider did not make — belongs to the
   * store and is covered there: planner-store.test.ts "never lets automatic
   * selection replace an explicit user selection (SB-005)", plus the
   * alternatives-merge and new-plan cases beside it.
   */

  it("scrolls selected route controls within the planner scroll owner", async () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    const originalScrollTo = HTMLElement.prototype.scrollTo
    const scrollTo = vi.fn()

    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: scrollTo })
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        if (this.classList.contains("planner-scroll")) {
          return { x: 0, y: 100, top: 100, right: 390, bottom: 700, left: 0, width: 390, height: 600, toJSON: () => ({}) }
        }
        if (this.classList.contains("route-selection-identity")) {
          return { x: 0, y: 280, top: 280, right: 390, bottom: 304, left: 0, width: 390, height: 24, toJSON: () => ({}) }
        }
        return originalGetBoundingClientRect.call(this)
      }
    })

    function Harness() {
      const [selectedId, setSelectedId] = useState(routes[0]!.id)
      return (
        <RouteComparison
          routes={routes}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSave={vi.fn()}
          onExport={vi.fn()}
          onRide={vi.fn()}
          showRouteChoices={false}
        />
      )
    }

    try {
      // Production opens details for a route that is already selected, so the
      // layout effect runs on mount rather than after a chooser tap.
      const { container } = render(<div className="planner-scroll"><Harness /></div>)
      const scrollOwner = container.querySelector<HTMLElement>(".planner-scroll")
      await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 172, behavior: "auto" }))
      expect(scrollTo.mock.contexts.at(-1)).toBe(scrollOwner)
    } finally {
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", { configurable: true, value: originalGetBoundingClientRect })
      if (originalScrollTo) {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: originalScrollTo })
      } else {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: undefined })
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
    const { unmount } = renderComparison({ routes: [route], selectedId: route.id })
    await user.click(screen.getByRole("button", { name: "Show turn-by-turn directions" }))
    expect(screen.getByText("330 ft")).toBeInTheDocument()

    unmount()
    window.localStorage.setItem("switchback:rider-settings", JSON.stringify({ version: 1, units: "metric", bikes: [], activeBikeId: "" }))
    renderComparison({ routes: [route], selectedId: route.id })
    await user.click(screen.getByRole("button", { name: "Show turn-by-turn directions" }))
    expect(screen.getByText("100 m")).toBeInTheDocument()
    window.localStorage.removeItem("switchback:rider-settings")
  })

    /*
   * The four surface-evidence cases that used to sit here asserted on the
   * legacy chooser's route slips — markup `showRouteChoices={false}` never
   * renders. Their contract, that unknown surface never becomes a measured
   * zero, is verified against the components production does render:
   * route-evidence-panel.test.tsx (unavailable surface, informational
   * zero-overlap, unavailable survey evidence) and
   * route-data-quality-panel.test.tsx (unknown-surface caveat, unavailable
   * condition coverage). Nothing was weakened; the verification moved to
   * where the code ships.
   */

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
    renderComparison({ routes: [route], selectedId: route.id })

    await user.click(screen.getByRole("button", { name: "Show route details" }))
    expect(within(screen.getByLabelText("Route character")).getByText("Why this route")).toBeVisible()
    const why = screen.getByRole("note", { name: "Why this route scored well" })
    expect(why).toHaveTextContent("Mostly secondary roads (72%).")
    expect(why).not.toHaveTextContent("scenic-1-9t484x:aggregate")
    expect(why).not.toHaveTextContent("unknown legal access")
  })
})
