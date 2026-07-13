import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { RouteComparison } from "@/components/planner/RouteComparison"
import type { PlannedRoute } from "@/lib/routing/types"

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
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    previewOnly: false,
    overlapPercent: 100
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

describe("route comparison rack", () => {
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

    await user.click(screen.getByRole("button", { name: /select quick route/i }))
    await user.click(screen.getByRole("button", { name: /save route/i }))
    await user.click(screen.getByRole("button", { name: /export gpx/i }))
    await user.click(screen.getByRole("button", { name: /start ride/i }))

    expect(onSave).toHaveBeenCalledWith(routes[1])
    expect(onExport).toHaveBeenCalledWith(routes[1])
    expect(onRide).toHaveBeenCalledWith(routes[1])
  })
})
