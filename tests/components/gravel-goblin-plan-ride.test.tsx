import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RideAdvisor } from "@/components/planner/v2/RideAdvisor"
import type { ProposedRide, ProposedStop } from "@/lib/advice/contracts"
import type { PlannedRoute } from "@/lib/routing/types"

const advisorClient = vi.hoisted(() => ({
  fetchAdvisorCapability: vi.fn(),
  requestAdvisorTurn: vi.fn()
}))

vi.mock("@/lib/client/advisor-client", () => advisorClient)

const proposedRide: ProposedRide = {
  mode: "loop",
  profile: "gravel",
  targetMinutes: 180,
  start: { name: "Harrisburg", lat: 40.2732, lon: -76.8867 },
  finish: null,
  waypoints: [],
  avoidHighways: true,
  tollPolicy: "avoid",
  summary: "Three-hour gravel loop from Harrisburg with a brewery finish."
}

const proposedStop: ProposedStop = {
  id: "osm-brewery-0",
  name: "The Millworks",
  reason: "A brewery to finish on, right where the loop closes.",
  kind: "brewery",
  anchor: { lat: 40.2707, lon: -76.8875 },
  routeProgress: null,
  citations: []
}

function plannedRoute(): PlannedRoute {
  return {
    id: "gravel-1",
    name: "Gravel route",
    profile: "gravel",
    geometry: [[-76.9, 40.2], [-76.8, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 75,
    durationMinutes: 173,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 88,
    turnCount: 127,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
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
  advisorClient.requestAdvisorTurn.mockResolvedValue({
    status: "ok",
    message: "Three-hour loop out of Harrisburg, finishing at The Millworks.",
    secondOpinion: null,
    proposedStops: [proposedStop],
    proposedRide,
    citations: [],
    usage: { toolCalls: 2, groundedQueries: 0 }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * Planning the Goblin's own proposal is the one route change the rider asked
 * for, so it must not behave like the route changing under them. It used to:
 * the brewery the rider requested was cleared at the moment the ride appeared,
 * before they could add it.
 */
describe("planning a Gravel Goblin ride", () => {
  it("keeps the stop the rider asked for when its own ride is planned", async () => {
    const user = userEvent.setup()
    const onPlanRide = vi.fn()

    const { rerender } = render(
      <RideAdvisor
        routes={[]}
        selectedRouteId=""
        warnings={[]}
        onAddStop={vi.fn()}
        onPlanRide={onPlanRide}
      />
    )

    await user.click(await screen.findByRole("button", { name: /Need a ride idea/ }))
    await user.type(
      screen.getByRole("textbox", { name: "Ask Gravel Goblin" }),
      "Three hours of gravel from Harrisburg, brewery at the end"
    )
    await user.click(screen.getByRole("button", { name: "Send to Gravel Goblin" }))

    expect(await screen.findByText("The Millworks")).toBeInTheDocument()
    await user.click(await screen.findByRole("button", { name: "Plan this ride" }))
    expect(onPlanRide).toHaveBeenCalledWith(proposedRide)

    // The planner answers: routes now exist, which is a scope change.
    rerender(
      <RideAdvisor
        routes={[plannedRoute()]}
        selectedRouteId="gravel-1"
        warnings={[]}
        onAddStop={vi.fn()}
        onPlanRide={onPlanRide}
      />
    )

    expect(await screen.findByText("The Millworks")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add to ride" })).toBeInTheDocument()
    expect(screen.queryByText(/Route changed/)).not.toBeInTheDocument()
  })

  it("still drops stale stop ideas when the route changes on its own", async () => {
    const user = userEvent.setup()

    const { rerender } = render(
      <RideAdvisor
        routes={[]}
        selectedRouteId=""
        warnings={[]}
        onAddStop={vi.fn()}
        onPlanRide={vi.fn()}
      />
    )

    await user.click(await screen.findByRole("button", { name: /Need a ride idea/ }))
    await user.type(
      screen.getByRole("textbox", { name: "Ask Gravel Goblin" }),
      "Three hours of gravel from Harrisburg"
    )
    await user.click(screen.getByRole("button", { name: "Send to Gravel Goblin" }))
    expect(await screen.findByText("The Millworks")).toBeInTheDocument()

    rerender(
      <RideAdvisor
        routes={[plannedRoute()]}
        selectedRouteId="gravel-1"
        warnings={[]}
        onAddStop={vi.fn()}
        onPlanRide={vi.fn()}
      />
    )

    expect(await screen.findByText(/Route changed/)).toBeInTheDocument()
    expect(screen.queryByText("The Millworks")).not.toBeInTheDocument()
  })
})
