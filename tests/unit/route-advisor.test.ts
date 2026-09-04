import { describe, expect, it, vi } from "vitest"
import { createOpenRouterAdviser, resolveProposedStops, resolveSecondOpinion } from "@/lib/advice/openrouter-adviser"
import { createLocalGrounding, routeProgressOf } from "@/lib/advice/local-grounding"
import { createGoogleMapsGrounding } from "@/lib/advice/google-maps-grounding"
import { createAdviserFromEnvironment, resolveAdvisorCapability } from "@/lib/advice/capability"
import { advisorContextFromPlan, briefingText, sampleGeometry } from "@/lib/advice/route-context"
import type { AdvisorRouteContext, GroundedPlace, GroundingSource } from "@/lib/advice/contracts"
import type { PlaceResult } from "@/lib/geocoding/photon"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"

function geometry(): Coordinate[] {
  return Array.from({ length: 11 }, (_, index): Coordinate => [-77 + index * 0.04, 40.2])
}

const context: AdvisorRouteContext = {
  selectedRouteId: "best-ride",
  candidates: [
    {
      id: "best-ride",
      name: "Best Ride",
      profile: "twisty",
      distanceMiles: 44,
      durationMinutes: 88,
      twistiness: 82,
      turnCount: 61,
      roadMix: { secondary: 70, tertiary: 30 },
      surfaceMix: { asphalt: 100 }
    },
    {
      id: "fastest-now",
      name: "Fastest Now",
      profile: "quick",
      distanceMiles: 38,
      durationMinutes: 60,
      twistiness: 34,
      turnCount: 18,
      roadMix: { motorway: 55, primary: 45 },
      surfaceMix: { asphalt: 100 }
    }
  ],
  geometry: geometry(),
  warnings: ["Live traffic is unavailable; traffic quality uses road-feature data only."]
}

function place(overrides: Partial<GroundedPlace> = {}): GroundedPlace {
  return {
    placeId: "osm-coffee-0-40.2000--76.8000",
    name: "Ridge Road Roasters",
    kind: "coffee",
    lat: 40.2,
    lon: -76.8,
    citations: [{ title: "OpenStreetMap", url: "https://www.openstreetmap.org/", source: "switchback-local" }],
    ...overrides
  }
}

/** An OpenRouter stub that replays a fixed sequence of chat completions. */
function stubOpenRouter(responses: unknown[]) {
  const calls: Array<Record<string, unknown>> = []
  const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    const body = responses.shift() ?? { choices: [{ message: { content: "{}" } }] }
    return new Response(JSON.stringify(body), { status: 200 })
  })
  return { fetcher: fetcher as unknown as typeof fetch, calls }
}

function finalAnswer(answer: Record<string, unknown>) {
  return { choices: [{ message: { content: JSON.stringify(answer) } }] }
}

describe("advisor route context", () => {
  it("downsamples geometry while keeping both ends", () => {
    const dense = Array.from({ length: 500 }, (_, index): Coordinate => [-77 + index * 0.001, 40.2])
    const sampled = sampleGeometry(dense)
    expect(sampled).toHaveLength(40)
    expect(sampled[0]).toEqual(dense[0])
    expect(sampled.at(-1)).toEqual(dense.at(-1))
  })

  it("briefs the model with route ids, added minutes, and Switchback's own warnings", () => {
    const briefing = briefingText(context)
    expect(briefing).toContain("id=best-ride")
    expect(briefing).toContain("id=fastest-now")
    expect(briefing).toContain("[SWITCHBACK RECOMMENDS THIS]")
    expect(briefing).toContain("+28 min vs fastest")
    expect(briefing).toContain("Live traffic is unavailable")
  })

  it("builds a context from a plan, or nothing when the plan has no routes", () => {
    const route = {
      ...context.candidates[0]!,
      geometry: geometry(),
      waypoints: [],
      instructions: [],
      ascentMeters: null,
      descentMeters: null,
      routingSource: "live",
      previewOnly: false
    } as PlannedRoute
    const built = advisorContextFromPlan({
      selectedRouteId: "best-ride",
      routes: [route],
      warnings: []
    })
    expect(built?.selectedRouteId).toBe("best-ride")
    expect(built?.candidates).toHaveLength(1)
    expect(advisorContextFromPlan({ selectedRouteId: "x", routes: [], warnings: [] })).toBeNull()
  })
})

describe("advisor safety boundaries", () => {
  it("drops a second opinion that names a route Switchback never produced", () => {
    const invented = {
      agreesWithSwitchback: false,
      wouldPick: "a-better-route-i-made-up",
      rationale: "It looks nicer.",
      cautions: [],
      confidence: "high"
    }
    expect(resolveSecondOpinion(invented, ["best-ride", "fastest-now"])).toBeNull()
    expect(resolveSecondOpinion({ ...invented, wouldPick: "fastest-now" }, ["best-ride", "fastest-now"]))
      .toMatchObject({ wouldPick: "fastest-now", confidence: "high" })
  })

  it("drops a proposed stop whose place no tool actually returned", () => {
    const places = new Map([[place().placeId, place()]])
    const stops = resolveProposedStops([
      { placeId: place().placeId, reason: "Good coffee at the halfway point." },
      { placeId: "invented-place-42", reason: "Trust me." }
    ], places, geometry())

    expect(stops).toHaveLength(1)
    expect(stops[0]!.name).toBe("Ridge Road Roasters")
    // Coordinates come from the tool result, never from the model.
    expect(stops[0]!.anchor).toEqual({ lat: 40.2, lon: -76.8 })
    expect(stops[0]!.routeProgress).toBeCloseTo(0.5, 1)
  })

  it("never proposes the same place twice or more than three stops", () => {
    const places = new Map(
      Array.from({ length: 5 }, (_, index) => {
        const entry = place({ placeId: `place-${index}`, name: `Stop ${index}` })
        return [entry.placeId, entry] as const
      })
    )
    const stops = resolveProposedStops([
      { placeId: "place-0", reason: "One." },
      { placeId: "place-0", reason: "One again." },
      { placeId: "place-1", reason: "Two." },
      { placeId: "place-2", reason: "Three." },
      { placeId: "place-3", reason: "Four." }
    ], places, geometry())
    expect(stops.map((stop) => stop.id)).toEqual(["place-0", "place-1", "place-2"])
  })

  it("places a point at the right progress along the route", () => {
    expect(routeProgressOf({ lat: 40.2, lon: -77 }, geometry())).toBe(0)
    expect(routeProgressOf({ lat: 40.2, lon: -76.6 }, geometry())).toBe(1)
    expect(routeProgressOf({ lat: 40.2, lon: -76.8 }, geometry())).toBeCloseTo(0.5, 2)
  })
})

describe("openrouter adviser", () => {
  it("runs tools, then answers with a grounded stop and a valid second opinion", async () => {
    const searchPlaces = vi.fn(async (): Promise<PlaceResult[]> => [{
      id: "photon-1",
      label: "Ridge Road Roasters",
      name: "Ridge Road Roasters",
      region: "Pennsylvania",
      country: "United States",
      lat: 40.2,
      lon: -76.8,
      kind: "cafe"
    }])
    const { fetcher, calls } = stubOpenRouter([
      {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call-1",
              type: "function",
              function: {
                name: "find_stops_along_route",
                arguments: JSON.stringify({ kind: "coffee", progress: 0.5 })
              }
            }]
          }
        }]
      },
      finalAnswer({
        message: "Best Ride is the one — 28 minutes more for twice the corners.",
        secondOpinion: {
          agreesWithSwitchback: true,
          wouldPick: "best-ride",
          rationale: "The curve score gap is worth the time.",
          cautions: ["I could not check live traffic."],
          confidence: "medium"
        },
        proposedStopIds: [{ placeId: "osm-coffee-0-40.2000--76.8000", reason: "Halfway coffee." }]
      })
    ])

    const adviser = createOpenRouterAdviser({
      apiKey: "test-key",
      fetcher,
      grounding: [createLocalGrounding({ searchPlaces: searchPlaces as never })]
    })
    const reply = await adviser.advise({ context, conversation: [] })

    expect(reply.status).toBe("ok")
    expect(reply.message).toContain("Best Ride")
    expect(reply.secondOpinion?.wouldPick).toBe("best-ride")
    expect(reply.proposedStops).toHaveLength(1)
    expect(reply.proposedStops[0]!.anchor).toEqual({ lat: 40.2, lon: -76.8 })
    expect(reply.usage.toolCalls).toBe(1)
    expect(reply.usage.groundedQueries).toBe(0)

    // Tools and the answer schema travel together, so the whole turn — one
    // tool round plus the answer — costs two completions, not three.
    expect(calls).toHaveLength(2)
    expect(calls[0]!.tools).toBeDefined()
    expect(calls[0]!.response_format).toBeDefined()
  })

  it("keeps a hallucinated stop out of the reply even when the model insists", async () => {
    const { fetcher } = stubOpenRouter([
      finalAnswer({
        message: "There's a great diner on this road.",
        secondOpinion: null,
        proposedStopIds: [{ placeId: "the-diner-i-imagined", reason: "It is great." }]
      })
    ])
    const adviser = createOpenRouterAdviser({ apiKey: "test-key", fetcher, grounding: [] })
    const reply = await adviser.advise({ context, conversation: [] })

    expect(reply.status).toBe("ok")
    expect(reply.proposedStops).toEqual([])
  })

  it("degrades to a status instead of throwing when OpenRouter fails", async () => {
    const failing = vi.fn(async () => new Response("nope", { status: 500 }))
    const adviser = createOpenRouterAdviser({
      apiKey: "test-key",
      fetcher: failing as unknown as typeof fetch,
      grounding: []
    })
    expect((await adviser.advise({ context, conversation: [] })).status).toBe("unavailable")

    const throwing = vi.fn(async () => { throw new Error("network down") })
    const broken = createOpenRouterAdviser({
      apiKey: "test-key",
      fetcher: throwing as unknown as typeof fetch,
      grounding: []
    })
    expect((await broken.advise({ context, conversation: [] })).status).toBe("unavailable")
  })

  it("reports malformed output rather than rendering it", async () => {
    const { fetcher } = stubOpenRouter([{ choices: [{ message: { content: "not json at all" } }] }])
    const adviser = createOpenRouterAdviser({ apiKey: "test-key", fetcher, grounding: [] })
    expect((await adviser.advise({ context, conversation: [] })).status).toBe("malformed")
  })

  it("carries the prior conversation so the rider can go back and forth", async () => {
    const { fetcher, calls } = stubOpenRouter([
      finalAnswer({ message: "Then take Fastest Now.", secondOpinion: null, proposedStopIds: [] })
    ])
    const adviser = createOpenRouterAdviser({ apiKey: "test-key", fetcher, grounding: [] })
    await adviser.advise({
      context,
      conversation: [
        { role: "rider", text: "Anything with coffee?" },
        { role: "advisor", text: "Ridge Road Roasters sits at the halfway point." }
      ],
      riderMessage: "Actually I'm short on time."
    })

    const messages = calls[0]!.messages as Array<{ role: string; content: string }>
    expect(messages.map((message) => message.role)).toEqual(["system", "user", "user", "assistant", "user"])
    expect(messages.at(-1)!.content).toBe("Actually I'm short on time.")
    expect(messages[3]!.content).toContain("Ridge Road Roasters")
  })
})

describe("google maps grounding", () => {
  it("sends the native google_maps tool with a location hint and returns cited prose", async () => {
    const requests: Array<Record<string, unknown>> = []
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: "Boiling Springs has a lakeside cafe riders stop at." }] },
          groundingMetadata: {
            groundingChunks: [{ maps: { title: "Cafe 101", uri: "https://maps.google.com/?cid=1" } }]
          }
        }]
      }), { status: 200 })
    })

    const source = createGoogleMapsGrounding({ apiKey: "maps-key", fetcher: fetcher as unknown as typeof fetch })
    const result = await source.call("ask_local_knowledge", { question: "Anywhere good halfway?" }, context)

    expect(source.attribution).toBe("Grounded with Google Maps")
    expect(requests[0]!.tools).toEqual([{ google_maps: {} }])
    expect(requests[0]!.toolConfig).toMatchObject({
      retrievalConfig: { latLng: { latitude: 40.2 } }
    })
    expect(result.citations).toEqual([
      { title: "Cafe 101", url: "https://maps.google.com/?cid=1", source: "google-maps" }
    ])
    // Maps grounding names places but hands back no coordinates Switchback may
    // route to, so it can never produce a waypoint on its own.
    expect(result.places).toEqual([])
  })

  it("refuses to pass along ungrounded prose", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "There is definitely a diner." }] } }]
    }), { status: 200 }))
    const source = createGoogleMapsGrounding({ apiKey: "maps-key", fetcher: fetcher as unknown as typeof fetch })
    const result = await source.call("ask_local_knowledge", { question: "Anywhere good?" }, context)

    expect(result.citations).toEqual([])
    expect(result.content).toMatchObject({ error: expect.stringContaining("could not check") })
  })

  it("counts a grounded query against usage when the advisor calls it", async () => {
    const mapsSource: GroundingSource = {
      id: "google-maps",
      attribution: "Grounded with Google Maps",
      tools: () => [{ name: "ask_local_knowledge", description: "ask", parameters: { type: "object" } }],
      call: async () => ({
        content: { answer: "Cafe 101 is right on the route." },
        places: [],
        citations: [{ title: "Cafe 101", url: "https://maps.google.com/?cid=1", source: "google-maps" }]
      })
    }
    const { fetcher } = stubOpenRouter([
      {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: "call-1",
              type: "function",
              function: { name: "ask_local_knowledge", arguments: JSON.stringify({ question: "halfway?" }) }
            }]
          }
        }]
      },
      finalAnswer({ message: "Cafe 101 is right there.", secondOpinion: null, proposedStopIds: [] })
    ])

    const adviser = createOpenRouterAdviser({ apiKey: "k", fetcher, grounding: [mapsSource] })
    const reply = await adviser.advise({ context, conversation: [] })

    expect(reply.usage.groundedQueries).toBe(1)
    // Sources reach the UI so the required attribution can be rendered.
    expect(reply.citations).toContainEqual({
      title: "Cafe 101",
      url: "https://maps.google.com/?cid=1",
      source: "google-maps"
    })
  })
})

describe("advisor capability gating", () => {
  it("is absent without an OpenRouter key", () => {
    expect(resolveAdvisorCapability({})).toEqual({
      enabled: false,
      groundingSources: [],
      attributions: []
    })
    expect(createAdviserFromEnvironment({})).toBeNull()
  })

  it("enables the key-free source alone by default", () => {
    const capability = resolveAdvisorCapability({ OPENROUTER_API_KEY: "key" })
    expect(capability.enabled).toBe(true)
    expect(capability.groundingSources).toEqual(["switchback-local"])
    expect(createAdviserFromEnvironment({ OPENROUTER_API_KEY: "key" })).not.toBeNull()
  })

  it("keeps Google Maps grounding off until it is explicitly switched on", () => {
    // A key alone is not consent: the flag is the owner's decision.
    expect(resolveAdvisorCapability({
      OPENROUTER_API_KEY: "key",
      GOOGLE_MAPS_API_KEY: "maps"
    }).groundingSources).toEqual(["switchback-local"])

    const enabled = resolveAdvisorCapability({
      OPENROUTER_API_KEY: "key",
      GOOGLE_MAPS_API_KEY: "maps",
      GOOGLE_MAPS_GROUNDING: "1"
    })
    expect(enabled.groundingSources).toEqual(["switchback-local", "google-maps"])
    expect(enabled.attributions).toContain("Grounded with Google Maps")
  })

  it("disables only the missing source, never the advisor", () => {
    // The flag without a key leaves the advisor working on the key-free source.
    const capability = resolveAdvisorCapability({
      OPENROUTER_API_KEY: "key",
      GOOGLE_MAPS_GROUNDING: "1"
    })
    expect(capability.enabled).toBe(true)
    expect(capability.groundingSources).toEqual(["switchback-local"])
  })
})
