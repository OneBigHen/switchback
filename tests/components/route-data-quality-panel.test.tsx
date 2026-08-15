import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { RouteDataQualityPanel } from "@/components/planner/RouteDataQualityPanel"
import type { PlannedRoute } from "@/lib/routing/types"

afterEach(cleanup)

function plannedRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "r1",
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

describe("RouteDataQualityPanel", () => {
  it("renders three coverage bars and a headline equal to the lowest coverage", () => {
    render(<RouteDataQualityPanel route={plannedRoute()} />)
    expect(screen.getByText("Access")).toBeInTheDocument()
    expect(screen.getByText("Surface")).toBeInTheDocument()
    expect(screen.getByText("Condition")).toBeInTheDocument()
    expect(screen.getAllByText(/\d+%/).length).toBeGreaterThan(0)
    expect(screen.getByText("data quality · lowest coverage")).toBeInTheDocument()
  })

  it("shows the unknown-surface mileage caveat when surfaceMix carries an unknown bucket", () => {
    render(<RouteDataQualityPanel route={plannedRoute({ distanceMiles: 60, surfaceMix: { asphalt: 70, unknown: 30 } })} />)
    expect(screen.getByText(/Surface type is unknown for 18\.0 miles of this route\./i)).toBeInTheDocument()
  })

  it("renders each caveat from route data quality as a warning row", () => {
    render(
      <RouteDataQualityPanel
        route={plannedRoute({ distanceMiles: 60 })}
        segments={[
          { miles: 40, hasAccessTag: true, hasSurfaceTag: true, hasSmoothnessOrTracktype: true },
          { miles: 20, hasAccessTag: false, hasSurfaceTag: false, hasSmoothnessOrTracktype: false, seasonalUndated: true }
        ]}
      />
    )
    expect(screen.getByText(/At least one segment is tagged seasonal without a date range/i)).toBeInTheDocument()
    expect(screen.getByText(/Access data is missing on 20\.0 miles of this route\./i)).toBeInTheDocument()
  })

  it("shows a distinct amber seasonal badge when seasonalUncertainty is true", () => {
    render(
      <RouteDataQualityPanel
        route={plannedRoute()}
        segments={[
          { miles: 50, hasAccessTag: true, hasSurfaceTag: true, hasSmoothnessOrTracktype: true, seasonalUndated: true }
        ]}
      />
    )
    const badge = screen.getByText("Seasonal uncertainty")
    expect(badge.closest(".route-data-quality-seasonal")?.getAttribute("data-tier")).toBe("seasonal")
  })

  it("renders the region build date in the route metadata footer when supplied", () => {
    render(
      <RouteDataQualityPanel
        route={plannedRoute()}
        sourceMapUpdated="2026-05-14T12:00:00.000Z"
      />
    )
    expect(screen.getByText("Source map updated:")).toBeInTheDocument()
    expect(screen.getByText(/2026-05-14T12:00:00\.000Z/)).toBeInTheDocument()
  })

  it("falls back to Unknown when sourceMapUpdated is missing", () => {
    render(<RouteDataQualityPanel route={plannedRoute()} />)
    expect(screen.getByText("Unknown")).toBeInTheDocument()
  })

  it("still renders the panel headline as the lowest coverage when surface coverage is the weakest", () => {
    const route = plannedRoute({ distanceMiles: 50, surfaceMix: { asphalt: 30, unknown: 70 } })
    render(<RouteDataQualityPanel route={route} />)
    const headline = screen.getByText("data quality · lowest coverage")
    const headlineValue = headline.previousElementSibling
    expect(headlineValue).not.toBeNull()
    expect(Number(headlineValue!.textContent!.replace("%", ""))).toBeLessThanOrEqual(30)
  })
})
