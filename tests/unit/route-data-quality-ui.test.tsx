import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RouteDataQualityPanel } from "@/components/planner/RouteDataQualityPanel"
import type { PlannedRoute } from "@/lib/routing/types"

afterEach(cleanup)

function plannedRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "ui-route",
    name: "Loop",
    profile: "twisty",
    geometry: [[-76.9, 40.2], [-76.8, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 50,
    durationMinutes: 60,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 70,
    turnCount: 10,
    roadMix: { secondary: 70, tertiary: 30 },
    surfaceMix: { asphalt: 80, gravel: 20 },
    routingSource: "live",
    previewOnly: false,
    ...overrides
  } as PlannedRoute
}

describe("RouteDataQualityPanel §9 contract", () => {
  it("renders three coverage bars with their respective percentages", () => {
    render(<RouteDataQualityPanel route={plannedRoute()} />)
    const bars = screen.getAllByRole("meter")
    expect(bars).toHaveLength(3)
    expect(screen.getByText("Access")).toBeInTheDocument()
    expect(screen.getByText("Surface")).toBeInTheDocument()
    expect(screen.getByText("Condition")).toBeInTheDocument()
    bars.forEach((bar) => {
      const percent = Number(bar.getAttribute("aria-valuenow"))
      expect(Number.isFinite(percent)).toBe(true)
      expect(percent).toBeGreaterThanOrEqual(0)
      expect(percent).toBeLessThanOrEqual(100)
    })
    const numbers = bars.map((bar) => Number(bar.getAttribute("aria-valuenow")))
    const headline = screen.getByText("mapped data coverage")
    const headlineValue = Number(headline.previousElementSibling?.textContent?.replace("%", ""))
    expect(headlineValue).toBe(Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length))
  })

  it("renders the unknown-surface mileage caveat when surfaceMix carries an unknown bucket", () => {
    render(
      <RouteDataQualityPanel
        route={plannedRoute({ distanceMiles: 60, surfaceMix: { asphalt: 70, unknown: 30 } })}
      />
    )
    expect(screen.getByText(/Surface type is unknown for 18\.0 miles of this route\./i)).toBeInTheDocument()
  })

  it("labels unavailable condition coverage in the meter text", () => {
    render(<RouteDataQualityPanel route={plannedRoute()} />)

    const condition = screen.getByRole("meter", { name: "Condition coverage unavailable" })
    expect(condition).toHaveAttribute("aria-valuetext", "Unavailable")
  })
})
