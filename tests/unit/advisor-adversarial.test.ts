import { afterEach, describe, expect, it, vi } from "vitest"
import { createGeminiAdviser } from "@/lib/advice/gemini-adviser"
import { resolveProposedRide, resolveSecondOpinion } from "@/lib/advice/resolve-answer"
import { createAdvisorToolbox, routeProgressOf } from "@/lib/advice/toolbox"
import { requestAdvisorTurn } from "@/lib/client/advisor-client"
import type { AdvisorRouteContext, GroundedPlace } from "@/lib/advice/contracts"
import type { Coordinate } from "@/lib/routing/types"

function grounded(placeId: string, name = placeId): GroundedPlace {
  return {
    placeId,
    name,
    kind: "scenic",
    lat: 40.2,
    lon: -76.8,
    citations: []
  }
}

describe("adversarial answer resolution", () => {
  it("rejects a second opinion whose agreement flag contradicts the route it picked", () => {
    const ids = ["switchback-pick", "other-route"]
    expect(resolveSecondOpinion({
      agreesWithSwitchback: true,
      wouldPick: "other-route",
      rationale: "Contradictory output.",
      confidence: "high"
    }, ids, "switchback-pick")).toBeNull()

    expect(resolveSecondOpinion({
      agreesWithSwitchback: false,
      wouldPick: "switchback-pick",
      rationale: "Also contradictory.",
      confidence: "high"
    }, ids, "switchback-pick")).toBeNull()
  })

  it("rejects the whole proposed ride when any requested shaping waypoint was never grounded", () => {
    const places = new Map([
      ["start", grounded("start", "Harrisburg")],
      ["finish", grounded("finish", "Gettysburg")],
      ["real-road", grounded("real-road", "Pine Grove Road")]
    ])

    expect(resolveProposedRide({
      mode: "destination",
      profile: "adventure",
      startPlaceId: "start",
      finishPlaceId: "finish",
      waypointPlaceIds: ["real-road", "invented-brewery"],
      avoidHighways: true,
      tollPolicy: "avoid",
      summary: "Via Pine Grove Road and the invented brewery."
    }, places)).toBeNull()
  })
})

describe("along-route location", () => {
  it("uses travelled distance rather than vertex count for route progress", () => {
    const uneven: Coordinate[] = [
      [-77, 40],
      [-76.999, 40],
      [-76, 40]
    ]
    const progress = routeProgressOf({ lat: 40, lon: -76.999 }, uneven)
    expect(progress).not.toBeNull()
    expect(progress!).toBeLessThan(0.01)
  })

  it("projects a point between vertices instead of snapping it to a vertex index", () => {
    const line: Coordinate[] = [[-77, 40], [-76, 40]]
    expect(routeProgressOf({ lat: 40, lon: -76.75 }, line)).toBeCloseTo(0.25, 2)
  })
})

describe("bounded Gemini tool loop", () => {
  it("rejects an oversized function-call batch instead of echoing unanswered calls", async () => {
    const context: AdvisorRouteContext = {
      selectedRouteId: "route-1",
      candidates: [{
        id: "route-1",
        name: "Route 1",
        profile: "adventure",
        distanceMiles: 40,
        durationMinutes: 80,
        twistiness: 70,
        turnCount: 30,
        roadMix: { secondary: 100 },
        surfaceMix: { asphalt: 80, gravel: 20 }
      }],
      geometry: [[-77, 40], [-76.8, 40.2]],
      warnings: []
    }
    const functionCalls = Array.from({ length: 5 }, (_, index) => ({
      functionCall: { id: `c-${index}`, name: "lookup_place", args: { query: `Place ${index}` } }
    }))
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: functionCalls } }]
    }), { status: 200 }))
    const toolbox = createAdvisorToolbox({ searchPlaces: vi.fn(async () => []) as never })

    const reply = await createGeminiAdviser({
      apiKey: "test",
      fetcher: fetcher as unknown as typeof fetch,
      toolbox
    }).advise({ context, conversation: [] })

    expect(reply.status).toBe("malformed")
    expect(reply.usage.toolCalls).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe("advisor HTTP degradation", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("preserves a server 429 as rate-limited instead of flattening it to unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code: "RATE_LIMITED", message: "Slow down." }
    }), { status: 429, headers: { "content-type": "application/json" } })))

    const reply = await requestAdvisorTurn({ context: null, conversation: [], riderMessage: "Build me a loop" })
    expect(reply.status).toBe("rate-limited")
  })
})
