import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PlannedRoute } from "@/lib/routing/types"
import { RouteSharePanel } from "@/components/planner/RouteSharePanel"

function longRoute(): PlannedRoute {
  // ~0.95 degrees of latitude (~106 km / ~66 mi) — comfortably longer than a
  // clamped 10-mile privacy radius, but shorter than an unclamped 500-mile one.
  const geometry: Array<[number, number]> = Array.from({ length: 20 }, (_, index) => [0, index * 0.05])
  return {
    id: "route-long",
    name: "Long ridge run",
    profile: "twisty",
    geometry,
    waypoints: [],
    instructions: [],
    distanceMiles: 66,
    durationMinutes: 120,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 40,
    turnCount: 10,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

describe("RouteSharePanel", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true
    })
  })

  it("clamps a manually-typed out-of-range privacy radius instead of redacting the whole route", async () => {
    render(<RouteSharePanel route={longRoute()} />)

    // The input's max="10" attribute is a visual hint only (this panel is not
    // inside a <form>, so native range validation never fires) — a rider can
    // type past it directly.
    fireEvent.change(screen.getByLabelText("Share privacy radius miles"), { target: { value: "500" } })
    fireEvent.click(screen.getByRole("button", { name: /Copy private link/i }))

    // An unclamped 500mi radius around the start point would cover this
    // entire ~66mi route, so `redactRouteForShare` would throw and the panel
    // would surface an error instead of a copied link.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Private route link copied/i))
  })
})
