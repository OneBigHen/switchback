import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RideAdvisor } from "@/components/planner/v2/RideAdvisor"

vi.mock("@/lib/client/advisor-client", () => ({
  fetchAdvisorCapability: vi.fn(),
  requestAdvisorTurn: vi.fn()
}))

const advisorClient = vi.mocked(await import("@/lib/client/advisor-client"))

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

/**
 * The idle planner has a height budget, and a large always-visible advisor
 * card is the most expensive thing that can sit in it. The rider has not asked
 * for the advisor yet, so it introduces itself in one row.
 */
describe("Gravel Goblin's idle invitation", () => {
  it("is one compact row: who it is, what it offers, and a way in", async () => {
    render(
      <RideAdvisor
        routes={[]}
        selectedRouteId=""
        warnings={[]}
        resultRevision={0}
        origin={null}
        onAddStop={vi.fn()}
      />
    )

    const invite = await screen.findByRole("region", { name: "Gravel Goblin ride builder" })
    const trigger = within(invite).getByRole("button")

    expect(trigger).toHaveAttribute("aria-expanded", "false")
    expect(within(trigger).getByText("Gravel Goblin")).toBeInTheDocument()
    expect(within(trigger).getByText("Need a ride idea?")).toBeInTheDocument()
  })

  it("stays out of the way until the advisor is actually available", async () => {
    advisorClient.fetchAdvisorCapability.mockResolvedValue({
      enabled: false,
      sources: [],
      attributions: []
    })

    render(
      <RideAdvisor
        routes={[]}
        selectedRouteId=""
        warnings={[]}
        resultRevision={0}
        origin={null}
        onAddStop={vi.fn()}
      />
    )

    // A capability that is not configured takes no planner space at all,
    // rather than advertising something the rider cannot use.
    await waitFor(() => expect(advisorClient.fetchAdvisorCapability).toHaveBeenCalled())
    expect(screen.queryByRole("region", { name: "Gravel Goblin ride builder" })).toBeNull()
  })
})
