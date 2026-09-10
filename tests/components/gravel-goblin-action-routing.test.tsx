import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RideAdvisor } from "@/components/planner/v2/RideAdvisor"
import type { AdvisorReply, ProposedStop } from "@/lib/advice/contracts"
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
    profile: id === "current" ? "balanced" : "adventure",
    geometry: [[-75.16, 40.18], [-75.28, 40.31]],
    waypoints: [],
    instructions: [],
    distanceMiles: id === "current" ? 42 : 45,
    durationMinutes: minutes,
    ascentMeters: null,
    descentMeters: null,
    twistiness: id === "current" ? 54 : 72,
    turnCount: id === "current" ? 81 : 116,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

const routes = [route("current", "Current Route", 88), route("better", "Creek Road Option", 94)]

const foodStop: ProposedStop = {
  id: "osm-food-1",
  name: "Actual Diner",
  reason: "Mapped food stop around 53% along the route.",
  kind: "food",
  anchor: { lat: 40.245, lon: -75.22 },
  routeProgress: 0.53,
  citations: [{
    title: "OpenStreetMap",
    url: "https://www.openstreetmap.org/",
    source: "switchback-local"
  }]
}

function ok(overrides: Partial<AdvisorReply> = {}): AdvisorReply {
  return {
    status: "ok",
    message: "Current route loaded.",
    secondOpinion: null,
    proposedStops: [],
    proposedRide: null,
    citations: [],
    usage: { toolCalls: 0, groundedQueries: 0 },
    ...overrides
  }
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })

  advisorClient.fetchAdvisorCapability.mockResolvedValue({
    enabled: true,
    sources: ["switchback-local"],
    attributions: []
  })
  advisorClient.requestAdvisorTurn.mockResolvedValue(ok())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function openGoblin() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole("button", { name: "Ask Gravel Goblin" }))
  await screen.findByText("Current route loaded.")
  return user
}

describe("Gravel Goblin command handoff", () => {
  it("routes an explicit add-stop command through the planner callback without another click", async () => {
    const onAddStop = vi.fn()
    const onRouteWithStop = vi.fn()
    advisorClient.requestAdvisorTurn
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({
        message: "Grounded stop: Actual Diner. It’s ready to route through.",
        proposedStops: [foodStop],
        secondOpinion: {
          agreesWithSwitchback: false,
          wouldPick: "better",
          rationale: "More curves.",
          cautions: [],
          confidence: "medium"
        }
      }))

    render(
      <RideAdvisor
        routes={routes}
        selectedRouteId="current"
        warnings={[]}
        onAddStop={onAddStop}
        onRouteWithStop={onRouteWithStop}
        onSelectRoute={vi.fn()}
      />
    )

    const user = await openGoblin()
    const input = screen.getByRole("textbox", { name: "Ask Gravel Goblin" })
    await user.type(input, "Reroute me with a food stop{Enter}")

    await waitFor(() => expect(onRouteWithStop).toHaveBeenCalledOnce())
    expect(onRouteWithStop).toHaveBeenCalledWith(foodStop)
    expect(onAddStop).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: /Add to ride/i })).not.toBeInTheDocument()
  })

  it("keeps exploratory stop discovery suggestion-only", async () => {
    const onAddStop = vi.fn()
    advisorClient.requestAdvisorTurn
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({
        message: "Best grounded stop: Actual Diner.",
        proposedStops: [foodStop]
      }))

    render(
      <RideAdvisor
        routes={routes}
        selectedRouteId="current"
        warnings={[]}
        onAddStop={onAddStop}
        onSelectRoute={vi.fn()}
      />
    )

    const user = await openGoblin()
    const input = screen.getByRole("textbox", { name: "Ask Gravel Goblin" })
    await user.type(input, "Anywhere good to stop?{Enter}")

    expect(await screen.findByRole("button", { name: /Add to ride/i })).toBeInTheDocument()
    expect(onAddStop).not.toHaveBeenCalled()
  })

  it("switches to a verified alternate route for an explicit reroute command", async () => {
    const onSelectRoute = vi.fn()
    advisorClient.requestAdvisorTurn
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({
        message: "Better verified candidate: Creek Road Option. It’s ready to show on the map.",
        secondOpinion: {
          agreesWithSwitchback: false,
          wouldPick: "better",
          rationale: "45 mi · 94 min · curve score 72/100 · 6 min longer.",
          cautions: [],
          confidence: "medium"
        }
      }))

    render(
      <RideAdvisor
        routes={routes}
        selectedRouteId="current"
        warnings={[]}
        onAddStop={vi.fn()}
        onSelectRoute={onSelectRoute}
      />
    )

    const user = await openGoblin()
    const input = screen.getByRole("textbox", { name: "Ask Gravel Goblin" })
    await user.type(input, "Find me a better route{Enter}")

    await waitFor(() => expect(onSelectRoute).toHaveBeenCalledOnce())
    expect(onSelectRoute).toHaveBeenCalledWith("better")
  })
})
