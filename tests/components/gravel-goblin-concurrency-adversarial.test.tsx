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

function route(id: string, geometry: [number, number][]): PlannedRoute {
  return {
    id,
    name: id === "current" ? "Current Route" : "Alternate Route",
    profile: id === "current" ? "balanced" : "adventure",
    geometry,
    waypoints: [],
    instructions: [],
    distanceMiles: id === "current" ? 42 : 45,
    durationMinutes: id === "current" ? 88 : 94,
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

const initialRoutes = [
  route("current", [[-75.16, 40.18], [-75.28, 40.31]]),
  route("better", [[-75.16, 40.18], [-75.18, 40.22], [-75.28, 40.31]])
]

const replannedSameIds = [
  route("current", [[-75.16, 40.18], [-75.08, 40.25], [-75.28, 40.31]]),
  route("better", [[-75.16, 40.18], [-75.34, 40.23], [-75.28, 40.31]])
]

const foodStop: ProposedStop = {
  id: "osm-food-1",
  name: "Actual Diner",
  reason: "Mapped food stop around 53% along the route.",
  kind: "food",
  anchor: { lat: 40.245, lon: -75.22 },
  routeProgress: 0.53,
  citations: [{ title: "OpenStreetMap", url: "https://www.openstreetmap.org/", source: "switchback-local" }]
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

describe("Gravel Goblin stale result and action lifecycle", () => {
  it("drops an in-flight answer when a same-id replan advances the canonical result revision", async () => {
    const held = deferred<AdvisorReply>()
    advisorClient.requestAdvisorTurn
      .mockResolvedValueOnce(ok())
      .mockImplementationOnce(() => held.promise)

    const onSelectRoute = vi.fn()
    const props = {
      selectedRouteId: "current",
      warnings: [] as string[],
      onAddStop: vi.fn(),
      onSelectRoute
    }
    const { rerender } = render(
      <RideAdvisor routes={initialRoutes} resultRevision="rev-1" {...props} />
    )

    const user = await openGoblin()
    await user.type(screen.getByRole("textbox", { name: "Ask Gravel Goblin" }), "Find me a better route{Enter}")
    await waitFor(() => expect(advisorClient.requestAdvisorTurn).toHaveBeenCalledTimes(2))

    rerender(
      <RideAdvisor routes={replannedSameIds} resultRevision="rev-2" {...props} />
    )

    held.resolve(ok({
      message: "Better verified candidate: Alternate Route. It’s ready to show on the map.",
      secondOpinion: {
        agreesWithSwitchback: false,
        wouldPick: "better",
        rationale: "Old result rationale.",
        cautions: [],
        confidence: "medium"
      }
    }))

    await waitFor(() => expect(screen.getByRole("button", { name: "Send to Gravel Goblin" })).not.toBeDisabled())
    expect(screen.queryByText(/Better verified candidate/)).not.toBeInTheDocument()
    expect(onSelectRoute).not.toHaveBeenCalled()
  })

  it("does not accept a second command while a compound planner action is unsettled", async () => {
    const action = deferred<void>()
    const onRouteWithStop = vi.fn(() => action.promise)
    advisorClient.requestAdvisorTurn
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({
        message: "Grounded stop: Actual Diner. A different verified route candidate is ready.",
        proposedStops: [foodStop],
        secondOpinion: {
          agreesWithSwitchback: false,
          wouldPick: "better",
          rationale: "More curves.",
          cautions: [],
          confidence: "medium"
        }
      }))
      .mockResolvedValueOnce(ok({ message: "This second command must not run yet." }))

    render(
      <RideAdvisor
        routes={initialRoutes}
        selectedRouteId="current"
        resultRevision="rev-1"
        warnings={[]}
        onAddStop={vi.fn()}
        onRouteWithStop={onRouteWithStop}
        onSelectRoute={vi.fn()}
      />
    )

    const user = await openGoblin()
    const input = screen.getByRole("textbox", { name: "Ask Gravel Goblin" })
    await user.type(input, "Reroute me with a food stop{Enter}")
    await waitFor(() => expect(onRouteWithStop).toHaveBeenCalledOnce())

    expect(screen.getByRole("button", { name: "Send to Gravel Goblin" })).toBeDisabled()
    await user.type(input, "Add coffee{Enter}")
    expect(advisorClient.requestAdvisorTurn).toHaveBeenCalledTimes(2)

    action.resolve()
    await waitFor(() => expect(screen.getByRole("button", { name: "Send to Gravel Goblin" })).not.toBeDisabled())
  })

  it("handles a rejected compound planner action without an unhandled rejection or false success", async () => {
    const onRouteWithStop = vi.fn(() => Promise.reject(new Error("router failed")))
    advisorClient.requestAdvisorTurn
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok({
        message: "Grounded stop: Actual Diner. A different verified route candidate is ready.",
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
        routes={initialRoutes}
        selectedRouteId="current"
        resultRevision="rev-1"
        warnings={[]}
        onAddStop={vi.fn()}
        onRouteWithStop={onRouteWithStop}
        onSelectRoute={vi.fn()}
      />
    )

    const user = await openGoblin()
    await user.type(screen.getByRole("textbox", { name: "Ask Gravel Goblin" }), "Reroute me with a food stop{Enter}")

    expect(await screen.findByText(/couldn’t apply that route change/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send to Gravel Goblin" })).not.toBeDisabled()
    expect(screen.queryByText(/verified changed route/i)).not.toBeInTheDocument()
  })
})
