import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RideAdvisor } from "@/components/planner/v2/RideAdvisor"

const advisorClient = vi.hoisted(() => ({
  fetchAdvisorCapability: vi.fn(),
  requestAdvisorTurn: vi.fn()
}))

vi.mock("@/lib/client/advisor-client", () => advisorClient)

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
  advisorClient.requestAdvisorTurn
    .mockResolvedValueOnce({
      status: "invalid-request",
      message: "",
      secondOpinion: null,
      proposedStops: [],
      proposedRide: null,
      citations: [],
      usage: { toolCalls: 0, groundedQueries: 0 }
    })
    .mockResolvedValueOnce({
      status: "ok",
      message: "Try the ridge roads and keep the loop compact.",
      secondOpinion: null,
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

describe("Gravel Goblin failed-turn retry", () => {
  it("retries the restored draft without duplicating the failed rider turn", async () => {
    const user = userEvent.setup()
    const riderMessage = "I have 90 minutes; mostly backroads."

    render(
      <RideAdvisor
        routes={[]}
        selectedRouteId=""
        warnings={[]}
        onAddStop={vi.fn()}
        onPlanRide={vi.fn()}
      />
    )

    await user.click(await screen.findByRole("button", { name: /Need a ride idea/ }))
    const composer = screen.getByRole("textbox", { name: "Ask Gravel Goblin" })
    await user.type(composer, riderMessage)
    await user.click(screen.getByRole("button", { name: "Send to Gravel Goblin" }))

    expect(await screen.findByText(/I couldn’t read that ride request/)).toBeInTheDocument()
    expect(composer).toHaveValue(riderMessage)

    await user.click(screen.getByRole("button", { name: "Send to Gravel Goblin" }))
    expect(await screen.findByText("Try the ridge roads and keep the loop compact.")).toBeInTheDocument()

    await waitFor(() => expect(advisorClient.requestAdvisorTurn).toHaveBeenCalledTimes(2))
    const secondInput = advisorClient.requestAdvisorTurn.mock.calls[1]?.[0]
    expect(secondInput).toMatchObject({
      riderMessage,
      conversation: []
    })
    expect(screen.getAllByText(riderMessage)).toHaveLength(1)
  })
})
