import { afterEach, describe, expect, it, vi } from "vitest"
import type { AdvisorRouteContext } from "@/lib/advice/contracts"
import {
  requestAdvisorTurn,
  type AdvisorTurnInput
} from "@/lib/client/advisor-client"
import {
  MAX_ADVISOR_BODY_BYTES,
  MAX_ADVISOR_CONVERSATION_TURNS
} from "@/lib/advice/request-limits"

const capability = { enabled: true, sources: [], attributions: [] }

function response() {
  return Response.json({
    status: "ok",
    message: "A short ride is ready.",
    secondOpinion: null,
    proposedStops: [],
    proposedRide: null,
    citations: [],
    usage: { toolCalls: 0, groundedQueries: 0 },
    capability
  })
}

function bodyFrom(fetcher: ReturnType<typeof vi.fn>): { payload: AdvisorTurnInput; bytes: number } {
  const init = fetcher.mock.calls[0]?.[1] as RequestInit
  const body = init.body as string
  return { payload: JSON.parse(body) as AdvisorTurnInput, bytes: new TextEncoder().encode(body).byteLength }
}

function sharedTurnLimit(): number {
  expect(MAX_ADVISOR_CONVERSATION_TURNS).toBe(12)
  return MAX_ADVISOR_CONVERSATION_TURNS
}

function context(overrides: Partial<AdvisorRouteContext> = {}): AdvisorRouteContext {
  return {
    selectedRouteId: "best-ride",
    candidates: [{
      id: "best-ride",
      name: "Ridge run",
      profile: "scenic",
      distanceMiles: 62,
      durationMinutes: 150,
      twistiness: 78,
      turnCount: 84,
      roadMix: { secondary: 0.8 },
      surfaceMix: { paved: 1 }
    }],
    geometry: [[-76.9, 40.2], [-76.8, 40.3]],
    warnings: [],
    ...overrides
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("advisor request byte budget", () => {
  it("posts a normal request unchanged and within the shared byte limit", async () => {
    const fetcher = vi.fn(async () => response())
    vi.stubGlobal("fetch", fetcher)
    const input: AdvisorTurnInput = {
      context: null,
      conversation: [{ role: "rider", text: "Find a scenic ride near Harrisburg." }],
      riderMessage: "Keep the next answer practical.",
      origin: { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
    }

    await expect(requestAdvisorTurn(input)).resolves.toMatchObject({ status: "ok" })

    const posted = bodyFrom(fetcher)
    expect(posted.payload).toEqual(input)
    expect(posted.bytes).toBeLessThanOrEqual(MAX_ADVISOR_BODY_BYTES)
  })

  it("trims oldest whole messages by actual UTF-8 JSON bytes while retaining the latest input and context", async () => {
    const fetcher = vi.fn(async () => response())
    vi.stubGlobal("fetch", fetcher)
    const maxTurns = sharedTurnLimit()
    const conversation = Array.from({ length: maxTurns }, (_, index) => ({
      role: index % 2 === 0 ? "rider" as const : "advisor" as const,
      text: `${index.toString().padStart(2, "0")}${"🙂".repeat(999)}`
    }))
    const routeContext = context()
    const input: AdvisorTurnInput = {
      context: routeContext,
      conversation,
      riderMessage: "Use the latest constraints and tell me what changed."
    }

    await expect(requestAdvisorTurn(input)).resolves.toMatchObject({ status: "ok" })

    const posted = bodyFrom(fetcher)
    expect(posted.bytes).toBeLessThanOrEqual(MAX_ADVISOR_BODY_BYTES)
    expect(posted.payload.context).toEqual(routeContext)
    expect(posted.payload.riderMessage).toBe(input.riderMessage)
    expect(posted.payload.conversation.length).toBeLessThan(maxTurns)
    expect(posted.payload.conversation).toEqual(conversation.slice(-posted.payload.conversation.length))
    expect(posted.payload.conversation.every((message) => message.text.length === 2_000)).toBe(true)
  })

  it("prunes a conversation over the shared turn limit to the newest turns", async () => {
    const fetcher = vi.fn(async () => response())
    vi.stubGlobal("fetch", fetcher)
    const maxTurns = sharedTurnLimit()
    const conversation = Array.from({ length: maxTurns + 3 }, (_, index) => ({
      role: index % 2 === 0 ? "rider" as const : "advisor" as const,
      text: `turn ${index}`
    }))

    await expect(requestAdvisorTurn({
      context: null,
      conversation,
      riderMessage: "Use the newest context."
    })).resolves.toMatchObject({ status: "ok" })

    const posted = bodyFrom(fetcher)
    expect(posted.payload.conversation).toHaveLength(maxTurns)
    expect(posted.payload.conversation).toEqual(conversation.slice(-maxTurns))
  })

  it("returns invalid-request without a network call when context alone exceeds the byte limit", async () => {
    const fetcher = vi.fn(async () => response())
    vi.stubGlobal("fetch", fetcher)
    const oversizedRoadMix = Object.fromEntries(
      Array.from({ length: 2_000 }, (_, index) => [`road-${index.toString().padStart(4, "0")}`, index])
    )
    const input: AdvisorTurnInput = {
      context: context({
        candidates: [{
          ...context().candidates[0]!,
          roadMix: oversizedRoadMix
        }]
      }),
      conversation: [],
      riderMessage: "Keep this text available so I can retry it."
    }

    await expect(requestAdvisorTurn(input)).resolves.toMatchObject({ status: "invalid-request" })
    expect(fetcher).not.toHaveBeenCalled()
    expect(input.riderMessage).toBe("Keep this text available so I can retry it.")
  })
})
