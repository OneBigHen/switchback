// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { handleAdvisorPost } from "@/app/api/advisor/route"
import { emptyReply, type AdviceRequest } from "@/lib/advice/contracts"
import { requestAdvisorTurn } from "@/lib/client/advisor-client"

vi.mock("@/lib/advice/capability", () => ({
  resolveAdvisorCapability: () => ({ enabled: true, sources: [], attributions: [] }),
  createAdviserFromEnvironment: () => ({
    advise: async (input: AdviceRequest) => ({
      ...emptyReply("ok"),
      message: input.context ? "Discussing your route." : `Planning from ${input.origin?.label}.`
    })
  })
}))

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
})
