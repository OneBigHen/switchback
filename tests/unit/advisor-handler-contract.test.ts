// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { handleAdvisorPost } from "@/app/api/advisor/route"
import { emptyReply, type AdviceRequest } from "@/lib/advice/contracts"
import { requestAdvisorTurn } from "@/lib/client/advisor-client"
import {
  MAX_ADVISOR_BODY_BYTES,
  MAX_ADVISOR_CONVERSATION_TURNS
} from "@/lib/advice/request-limits"

const mockAdvise = vi.hoisted(() => vi.fn())
const mockCreateAdviser = vi.hoisted(() => vi.fn(() => ({ advise: mockAdvise })))

function sharedTurnLimit(): number {
  expect(MAX_ADVISOR_CONVERSATION_TURNS).toBe(12)
  return MAX_ADVISOR_CONVERSATION_TURNS
}

vi.mock("@/lib/advice/capability", () => ({
  resolveAdvisorCapability: () => ({ enabled: true, sources: [], attributions: [] }),
  createAdviserFromEnvironment: mockCreateAdviser
}))

beforeEach(() => {
  mockAdvise.mockReset()
  mockAdvise.mockImplementation(async (input: AdviceRequest) => ({
    ...emptyReply("ok"),
    message: input.context ? "Discussing your route." : `Planning from ${input.origin?.label}.`
  }))
  mockCreateAdviser.mockClear()
})

afterEach(() => vi.unstubAllGlobals())

describe("advisor browser-to-handler contract", () => {
  it("reports invalid input through the real handler", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) =>
      handleAdvisorPost(new Request("http://localhost/api/advisor", init)))
    const reply = await requestAdvisorTurn({
      context: null, conversation: [], riderMessage: "x".repeat(1001)
    })
    expect(reply.status).toBe("invalid-request")
  })
  it("preserves operational failure as unavailable", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 503 }))
    const reply = await requestAdvisorTurn({ context: null, conversation: [], riderMessage: "A short ride" })
    expect(reply.status).toBe("unavailable")
  })
  it("accepts the browser's null context and preserves the explicit origin", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) =>
      handleAdvisorPost(new Request("http://localhost/api/advisor", init)))

    const reply = await requestAdvisorTurn({
      context: null,
      conversation: [],
      riderMessage: "I have 90 minutes.",
      origin: { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
    })

    expect(reply.status).toBe("ok")
    expect(reply.message).toBe("Planning from Harrisburg.")
  })

  it("accepts exactly the shared conversation turn limit through the browser handler", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) =>
      handleAdvisorPost(new Request("http://localhost/api/advisor", init)))

    const maxTurns = sharedTurnLimit()
    const conversation = Array.from({ length: maxTurns }, (_, index) => ({
      role: index % 2 === 0 ? "rider" as const : "advisor" as const,
      text: `turn ${index}`
    }))
    const reply = await requestAdvisorTurn({ context: null, conversation })

    expect(reply.status).toBe("ok")
  })

  it("rejects more than the shared conversation turn limit at the server boundary", async () => {
    const maxTurns = sharedTurnLimit()
    const conversation = Array.from({ length: maxTurns + 1 }, (_, index) => ({
      role: index % 2 === 0 ? "rider" as const : "advisor" as const,
      text: `turn ${index}`
    }))
    const response = await handleAdvisorPost(new Request("http://localhost/api/advisor", {
      method: "POST",
      body: JSON.stringify({ context: null, conversation })
    }))

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe("INVALID_ADVISOR_REQUEST")
  })

  it("short-circuits explicit Home without creating or calling the adviser", async () => {
    const response = await handleAdvisorPost(new Request("http://localhost/api/advisor", {
      method: "POST",
      body: JSON.stringify({ context: null, conversation: [], riderMessage: "I am tired; get me home" })
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      status: "ok",
      message: "Home is the planner's saved browser location. Use or save it in the planner before routing home.",
      proposedRide: null,
      proposedStops: []
    })
    expect(mockCreateAdviser).not.toHaveBeenCalled()
    expect(mockAdvise).not.toHaveBeenCalled()
  })

  it.each(["loop back home", "three-hour loop back home", "Free Ride home"])(
    "continues to the adviser for loop-qualified or generic Home wording: %s",
    async (riderMessage) => {
      const response = await handleAdvisorPost(new Request("http://localhost/api/advisor", {
        method: "POST",
        body: JSON.stringify({ context: null, conversation: [], riderMessage })
      }))

      expect(response.status).toBe(200)
      expect(mockCreateAdviser).toHaveBeenCalledOnce()
      expect(mockAdvise).toHaveBeenCalledOnce()
      expect(mockAdvise).toHaveBeenCalledWith(
        expect.objectContaining({ riderMessage }),
        expect.any(AbortSignal)
      )
    }
  )

  it.each([{}, { context: null }])("accepts absent or null pre-route context: %j", async (body) => {
    const response = await handleAdvisorPost(new Request("http://localhost/api/advisor", {
      method: "POST",
      body: JSON.stringify({ ...body, riderMessage: "Help me plan a ride." })
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).status).toBe("ok")
  })

  it.each([false, "route", {}, { candidates: [] }])("still rejects malformed route context: %j", async (context) => {
    const response = await handleAdvisorPost(new Request("http://localhost/api/advisor", {
      method: "POST", body: JSON.stringify({ context })
    }))
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe("INVALID_ADVISOR_REQUEST")
  })

  it("rejects a body over the shared byte limit before JSON validation", async () => {
    const response = await handleAdvisorPost(new Request("http://localhost/api/advisor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(MAX_ADVISOR_BODY_BYTES + 1)
    }))

    expect(response.status).toBe(413)
    expect((await response.json()).error.code).toBe("ADVISOR_REQUEST_TOO_LARGE")
  })
})
