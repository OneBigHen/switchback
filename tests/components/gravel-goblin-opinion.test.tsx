import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RideAdvisor } from "@/components/planner/v2/RideAdvisor"
import type { PlannedRoute } from "@/lib/routing/types"

const advisorClient = vi.hoisted(() => ({
  fetchAdvisorCapability: vi.fn(),
  requestAdvisorTurn: vi.fn()
}))

vi.mock("@/lib/client/advisor-client", () => advisorClient)

function route(id: string, name: string, minutes: number): PlannedRoute {
  return {
    id,
    name,
    profile: id === "fast" ? "quick" : "adventure",
    geometry: [[-76.9, 40.2], [-76.8, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: id === "fast" ? 38 : 44,
    durationMinutes: minutes,
    ascentMeters: null,
    descentMeters: null,
    twistiness: id === "fast" ? 34 : 82,
    turnCount: id === "fast" ? 18 : 61,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

const routes = [route("best", "Best Ride", 88), route("fast", "Fastest Now", 60)]

beforeEach(() => {
  advisorClient.fetchAdvisorCapability.mockResolvedValue({
    enabled: true,
    sources: ["switchback-local"],
    attributions: []
  })
  advisorClient.requestAdvisorTurn.mockResolvedValue({
    status: "ok",
    message: "I’d take Fastest Now today; the time saved is bigger than the road-character gain.",
    secondOpinion: {
      agreesWithSwitchback: false,
      wouldPick: "fast",
      rationale: "It saves 28 minutes and still keeps enough secondary-road character for this ride.",
      cautions: ["Mapped surface data is incomplete on the middle section."],
      confidence: "high"
    },
    proposedStops: [],
    proposedRide: null,
    citations: [],
    usage: { toolCalls: 0, groundedQueries: 0 }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("Gravel Goblin route opinion", () => {
  it("shows confidence and cautions, and only selects an existing candidate after rider action", async () => {
    const user = userEvent.setup()
    const onSelectRoute = vi.fn()

    render(
      <RideAdvisor
        routes={routes}
        selectedRouteId="best"
        warnings={[]}
        onAddStop={vi.fn()}
        onSelectRoute={onSelectRoute}
      />
    )

    await user.click(await screen.findByRole("button", { name: "Ask Gravel Goblin" }))

    const opinion = await screen.findByRole("region", { name: "Gravel Goblin route opinion" })
    expect(opinion).toHaveTextContent("Goblin pick")
    expect(opinion).toHaveTextContent("Fastest Now")
    expect(opinion).toHaveTextContent("High confidence")
    expect(opinion).toHaveTextContent("It saves 28 minutes")
    expect(opinion).toHaveTextContent("Mapped surface data is incomplete")
    expect(onSelectRoute).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Show Fastest Now route" }))
    expect(onSelectRoute).toHaveBeenCalledOnce()
    expect(onSelectRoute).toHaveBeenCalledWith("fast")
  })
})
