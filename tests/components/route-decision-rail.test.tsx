import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RouteDecisionRail } from "@/components/planner/v2/RouteDecisionRail"
import { PlannerComposition } from "@/components/planner/PlannerComposition"
import type { PlannerDeckCommands, PlannerDeckViewModel } from "@/components/planner/PlannerDeckViewModel"
import type { PlannedRoute, RouteProfileId } from "@/lib/routing/types"
import type { ReactNode } from "react"

vi.mock("@/components/planner/PlannerDeck", () => ({
  PlannerDeck: ({ children }: { children?: ReactNode }) => <div data-testid="planner-deck">{children}</div>
}))

afterEach(cleanup)

function route(id: string, profile: RouteProfileId, minutes: number, miles: number, twistiness: number): PlannedRoute {
  return {
    id,
    name: `${profile} route`,
    profile,
    geometry: [[-76.88, 40.27], [-76.8, 40.33]],
    waypoints: [],
    instructions: [],
    distanceMiles: miles,
    durationMinutes: minutes,
    ascentMeters: 120,
    descentMeters: 110,
    twistiness,
    turnCount: 12,
    roadMix: { secondary: 80, primary: 20 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    provider: "graphhopper",
    providerVersion: "fixture-provider-version",
    previewOnly: false
  }
}

const routes = [
  route("balanced", "balanced", 62, 41.2, 55),
  route("twisty", "twisty", 71, 44.8, 91),
  route("scenic", "scenic", 76, 46.1, 72)
]

describe("RouteDecisionRail", () => {
  it("presents scan-first rider choices relative to the current route without provider jargon", () => {
    render(<RouteDecisionRail routes={routes} selectedId="twisty" onSelect={vi.fn()} />)

    expect(screen.getByRole("region", { name: "Route choices" })).toBeInTheDocument()
    expect(screen.getByText("Fastest Now")).toBeInTheDocument()
    expect(screen.getByText("Maximum Twisties")).toBeInTheDocument()
    expect(screen.queryByText(/graphhopper/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fixture-provider-version/i)).not.toBeInTheDocument()

    const selected = screen.getByRole("article", { name: /Maximum Twisties/i })
    expect(selected).toHaveAttribute("data-selected", "true")
    expect(within(selected).getByText("Selected")).toBeInTheDocument()
    expect(within(selected).getByText("Current route")).toBeInTheDocument()
    expect(within(selected).getByText("71 min")).toBeInTheDocument()
    expect(within(selected).getByText("44.8 mi")).toBeInTheDocument()

    const faster = screen.getByRole("article", { name: /Fastest Now/i })
    expect(within(faster).getByText("-9 min · -3.6 mi · -36 curve")).toBeInTheDocument()
  })

  it("selects a candidate immediately and exposes a separate details action", () => {
    const onSelect = vi.fn()
    const onOpenDetails = vi.fn()
    render(
      <RouteDecisionRail
        routes={routes}
        selectedId="balanced"
        onSelect={onSelect}
        onOpenDetails={onOpenDetails}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Select twisty route" }))
    expect(onSelect).toHaveBeenCalledWith("twisty")

    fireEvent.click(screen.getByRole("button", { name: "Details for twisty route" }))
    expect(onOpenDetails).toHaveBeenCalledWith("twisty")
  })

  it("keeps controls distinguishable when multiple candidates share the same role", () => {
    const tied = [
      route("balanced", "balanced", 62, 41.2, 55),
      route("quick", "quick", 62, 40.8, 40)
    ]
    render(<RouteDecisionRail routes={tied} selectedId="" onSelect={vi.fn()} onOpenDetails={vi.fn()} />)

    expect(screen.getAllByText("Fastest Now")).toHaveLength(2)
    expect(screen.getByRole("button", { name: "Select balanced route" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Select quick route" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Details for balanced route" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Details for quick route" })).toBeInTheDocument()
  })

  it("renders at most one default warning line per candidate", () => {
    const risky = {
      ...routes[2]!,
      previewOnly: true,
      navigationMode: "track-only" as const
    }
    render(<RouteDecisionRail routes={[routes[0]!, risky]} selectedId={risky.id} onSelect={vi.fn()} />)

    const card = screen.getByRole("article", { name: /Best Ride/i })
    expect(within(card).getAllByTestId("route-decision-warning")).toHaveLength(1)
  })

  it("keeps route choice primary and reveals preparation details only on request", () => {
    const comparison = {
      routes,
      selectedId: "twisty",
      onSelect: vi.fn(),
      onSave: vi.fn(),
      onExport: vi.fn(),
      onRide: vi.fn()
    }

    render(
      <PlannerComposition
        viewModel={{} as PlannerDeckViewModel}
        commands={{} as PlannerDeckCommands}
        comparison={comparison}
      />
    )

    expect(screen.getByRole("region", { name: "Route choices" })).toBeInTheDocument()
    expect(screen.getByRole("article", { name: /Maximum Twisties: twisty route route option/i })).toHaveAttribute("data-selected", "true")
    expect(screen.queryByText("Selected route")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Show turn-by-turn directions" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Details for twisty route" }))

    expect(comparison.onSelect).toHaveBeenCalledWith("twisty")
    expect(screen.getByRole("button", { name: "Back to route choices" })).toBeInTheDocument()
    expect(screen.getByText("Selected route")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show turn-by-turn directions" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Back to route choices" }))
    expect(screen.queryByText("Selected route")).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Route choices" })).toBeInTheDocument()
  })
})
