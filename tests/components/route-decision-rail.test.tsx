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
  it("presents scan-first rider choices without provider jargon", () => {
    render(<RouteDecisionRail routes={routes} selectedId="twisty" onSelect={vi.fn()} />)

    expect(screen.getByRole("region", { name: "Route choices" })).toBeInTheDocument()
    expect(screen.getByText("Fastest Now")).toBeInTheDocument()
    expect(screen.getByText("Maximum Twisties")).toBeInTheDocument()
    expect(screen.queryByText(/graphhopper/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/fixture-provider-version/i)).not.toBeInTheDocument()

    const selected = screen.getByRole("article", { name: /Maximum Twisties/i })
    expect(selected).toHaveAttribute("data-selected", "true")
    expect(within(selected).getByText("+9 min")).toBeInTheDocument()
    expect(within(selected).getByText("71 min")).toBeInTheDocument()
    expect(within(selected).getByText("44.8 mi")).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole("button", { name: /Select Maximum Twisties/i }))
    expect(onSelect).toHaveBeenCalledWith("twisty")

    fireEvent.click(screen.getByRole("button", { name: /Details for Maximum Twisties/i }))
    expect(onOpenDetails).toHaveBeenCalledWith("twisty")
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

  it("is the primary choice surface while legacy comparison remains preparation details", () => {
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
    expect(screen.getByRole("article", { name: /Maximum Twisties route option/i })).toHaveAttribute("data-selected", "true")
    expect(screen.queryByRole("heading", { name: "Choose a route" })).not.toBeInTheDocument()
    expect(screen.getByText("Selected route")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show turn-by-turn directions" })).toBeInTheDocument()
  })
})
