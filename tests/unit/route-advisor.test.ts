import { describe, expect, it, vi } from "vitest"
import { createGeminiAdviser } from "@/lib/advice/gemini-adviser"
import { createAdvisorToolbox, routeProgressOf } from "@/lib/advice/toolbox"
import {
  resolveProposedRide,
  resolveProposedStops,
  resolveSecondOpinion
} from "@/lib/advice/resolve-answer"
import { createAdviserFromEnvironment, resolveAdvisorCapability } from "@/lib/advice/capability"
import { advisorContextFromPlan, advisorSystemPrompt, briefingText, sampleGeometry } from "@/lib/advice/route-context"
import { selectNudge } from "@/lib/advice/nudges"
import type { AdvisorRouteContext, GroundedPlace } from "@/lib/advice/contracts"
import type { CurvatureSegment } from "@/lib/curvature/repository"
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
      profile: "adventure",
      distanceMiles: 44,
      durationMinutes: 88,
      twistiness: 82,
      turnCount: 61,
      roadMix: { secondary: 70, unclassified: 30 },
      surfaceMix: { asphalt: 78, gravel: 22 }
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

function route(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "best-ride",
    name: "Best Ride",
    profile: "adventure",
    geometry: geometry(),
    waypoints: [],
    instructions: [],
    distanceMiles: 44,
    durationMinutes: 88,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 82,
    turnCount: 61,
    roadMix: { secondary: 100 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    previewOnly: false,
    ...overrides
  }
}

function place(overrides: Partial<GroundedPlace> = {}): GroundedPlace {
  return {
    placeId: "osm-brewery-0-40.2000--76.8000",
    name: "Switchback Brewing",
    kind: "brewery",
    lat: 40.2,
    lon: -76.8,
    citations: [{ title: "OpenStreetMap", url: "https://www.openstreetmap.org/", source: "switchback-local" }],
    ...overrides
  }
}

/** A Gemini stub that replays a fixed sequence of generateContent responses. */
function stubGemini(responses: unknown[]) {
  const calls: Array<Record<string, unknown>> = []
  const urls: string[] = []
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(String(url))
    calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    const body = responses.shift() ?? { candidates: [{ content: { parts: [{ text: "{}" }] } }] }
    return new Response(JSON.stringify(body), { status: 200 })
  })
  return { fetcher: fetcher as unknown as typeof fetch, calls, urls }
}

function answer(value: Record<string, unknown>) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }
}

function functionCall(name: string, args: Record<string, unknown>) {
  return {
    candidates: [{
      content: { parts: [{ functionCall: { id: "call-1", name, args } }] }
    }]
  }
}

const photonResult: PlaceResult = {
  id: "photon-1",
  label: "Switchback Brewing",
  name: "Switchback Brewing",
  region: "Pennsylvania",
  country: "United States",
  lat: 40.2,
  lon: -76.8,
  kind: "brewery"
}

describe("advisor route context", () => {
  it("downsamples geometry while keeping both ends", () => {
    const dense = Array.from({ length: 500 }, (_, index): Coordinate => [-77 + index * 0.001, 40.2])
    const sampled = sampleGeometry(dense)
    expect(sampled).toHaveLength(40)
    expect(sampled[0]).toEqual(dense[0])
    expect(sampled.at(-1)).toEqual(dense.at(-1))
  })

  it("briefs the model with route ids, added minutes, unpaved share, and Switchback's warnings", () => {
    const briefing = briefingText(context)
    expect(briefing).toContain("id=best-ride")
    expect(briefing).toContain("[SWITCHBACK RECOMMENDS THIS]")
    expect(briefing).toContain("+28 min vs fastest")
    // Gravel is a selling point for this rider, so it is in the briefing — but
    // stated as *mapped* surface, which is all Switchback actually knows.
    expect(briefing).toContain("22% mapped unpaved")
    expect(briefing).toContain("Live traffic is unavailable")
  })

  it("frames gravel as desirable without inferring what the rider or bike can handle", () => {
    const prompt = advisorSystemPrompt({ context, conversation: [] })
    expect(prompt).toContain("dual-sport")
    expect(prompt).toContain("Mapped gravel and dirt can be a feature")
    // The persona must never turn "dual-sport" into a capability or legality claim.
    expect(prompt).toContain("never infer the rider's skill, bike capability")
    expect(prompt).toContain("legal access, road maintenance, or current passability")
    expect(prompt).toContain("id=best-ride")
  })

  it("switches to ride-building mode when there is no route yet", () => {
    const prompt = advisorSystemPrompt({
      context: null,
      conversation: [],
      origin: { lat: 40.2732, lon: -76.8867, label: "Harrisburg" }
    })
    expect(prompt).toContain("THERE IS NO ROUTE YET")
    expect(prompt).toContain("proposedRide")
    expect(prompt).toContain("Harrisburg")
  })

  it("builds a context from a plan, or nothing when the plan has no routes", () => {
    const built = advisorContextFromPlan({ selectedRouteId: "best-ride", routes: [route()], warnings: [] })
    expect(built?.selectedRouteId).toBe("best-ride")
    expect(advisorContextFromPlan({ selectedRouteId: "x", routes: [], warnings: [] })).toBeNull()
  })
})

describe("advisor safety boundaries", () => {
  it("drops a second opinion that names a route Switchback never produced", () => {
    const invented = {
      agreesWithSwitchback: false,
      wouldPick: "a-better-route-i-made-up",
      rationale: "It looks nicer.",
      confidence: "high"
    }
    expect(resolveSecondOpinion(invented, ["best-ride", "fastest-now"])).toBeNull()
    expect(resolveSecondOpinion({ ...invented, wouldPick: "fastest-now" }, ["best-ride", "fastest-now"]))
      .toMatchObject({ wouldPick: "fastest-now", confidence: "high" })
  })

  it("drops a proposed stop whose place no tool actually returned", () => {
    const places = new Map([[place().placeId, place()]])
    const stops = resolveProposedStops([
      { placeId: place().placeId, reason: "Good beer at the halfway point." },
      { placeId: "invented-place-42", reason: "Trust me." }
    ], places, geometry())

    expect(stops).toHaveLength(1)
    expect(stops[0]!.name).toBe("Switchback Brewing")
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

describe("proposed ride resolution", () => {
  const places = new Map([
    ["start", place({ placeId: "start", name: "Harrisburg", kind: "scenic", lat: 40.2732, lon: -76.8867 })],
    ["finish", place({ placeId: "finish", name: "Gettysburg", kind: "scenic", lat: 39.8309, lon: -77.2311 })],
    ["stop", place({ placeId: "stop", name: "Switchback Brewing" })]
  ])

  const valid = {
    mode: "destination",
    profile: "adventure",
    targetMinutes: 180,
    startPlaceId: "start",
    finishPlaceId: "finish",
    waypointPlaceIds: ["stop"],
    avoidHighways: true,
    tollPolicy: "avoid",
    summary: "Gravel run to Gettysburg with a beer on the way."
  }

  it("resolves every point from tool results, never from model prose", () => {
    const ride = resolveProposedRide(valid, places)
    expect(ride).not.toBeNull()
    expect(ride!.start).toEqual({ name: "Harrisburg", lat: 40.2732, lon: -76.8867 })
    expect(ride!.waypoints).toEqual([{ name: "Switchback Brewing", lat: 40.2, lon: -76.8 }])
    expect(ride!.profile).toBe("adventure")
    expect(ride!.avoidHighways).toBe(true)
    expect(ride!.tollPolicy).toBe("avoid")
  })

  it("refuses a ride whose start or finish was never pinned", () => {
    expect(resolveProposedRide({ ...valid, startPlaceId: "nowhere" }, places)).toBeNull()
    expect(resolveProposedRide({ ...valid, finishPlaceId: "nowhere" }, places)).toBeNull()
  })

  it("refuses an unknown profile rather than guessing one", () => {
    expect(resolveProposedRide({ ...valid, profile: "hooning" }, places)).toBeNull()
  })

  it("drops an out-of-range time target instead of clamping it", () => {
    // A destination ride survives without a target; the bad number just goes.
    expect(resolveProposedRide({ ...valid, targetMinutes: 9_000 }, places)?.targetMinutes).toBeNull()
    // A loop has no meaning without one, so the whole ride is refused.
    expect(resolveProposedRide(
      { ...valid, mode: "loop", finishPlaceId: undefined, targetMinutes: 9_000 },
      places
    )).toBeNull()
  })

  it("builds a loop that returns to its start", () => {
    const loop = resolveProposedRide(
      { ...valid, mode: "loop", finishPlaceId: undefined, targetMinutes: 240 },
      places
    )
    expect(loop?.mode).toBe("loop")
    expect(loop?.finish).toBeNull()
    expect(loop?.targetMinutes).toBe(240)
  })

  it("refuses the whole ride when one shaping point was never pinned", () => {
    // Dropping the unresolved point would silently produce a different ride than
    // the summary promises, so the entire draft is refused instead.
    expect(resolveProposedRide(
      { ...valid, waypointPlaceIds: ["stop", "imagined-diner"] },
      places
    )).toBeNull()
  })

  it("keeps a resolved waypoint list and ignores a repeat of a point already used", () => {
    const ride = resolveProposedRide(
      { ...valid, waypointPlaceIds: ["stop", "stop", "start"] },
      places
    )
    expect(ride?.waypoints.map((point) => point.name)).toEqual(["Switchback Brewing"])
  })
})

describe("advisor toolbox", () => {
  it("finds real stops along the route and never returns unmapped ones", async () => {
    const searchPlaces = vi.fn(async () => [photonResult])
    const toolbox = createAdvisorToolbox({ searchPlaces: searchPlaces as never })
    const result = await toolbox.call("find_stops", { kind: "brewery", progress: 0.5 }, {
      context,
      conversation: []
    })

    expect(result.places).toHaveLength(1)
    expect(result.places[0]!.lat).toBe(40.2)
    expect(searchPlaces).toHaveBeenCalledWith("brewery", expect.objectContaining({
      bias: { lat: 40.2, lon: -76.8 }
    }))
  })

  it("tells the model to say nothing rather than invent when a lookup fails", async () => {
    const searchPlaces = vi.fn(async () => { throw new Error("photon down") })
    const toolbox = createAdvisorToolbox({ searchPlaces: searchPlaces as never })
    const result = await toolbox.call("find_stops", { kind: "coffee" }, { context, conversation: [] })

    expect(result.places).toEqual([])
    expect(result.content).toMatchObject({ error: expect.stringContaining("do not suggest") })
  })

  it("searches around the rider's origin when there is no route yet", async () => {
    const searchPlaces = vi.fn(async () => [photonResult])
    const toolbox = createAdvisorToolbox({ searchPlaces: searchPlaces as never })
    await toolbox.call("lookup_place", { query: "Boiling Springs" }, {
      context: null,
      conversation: [],
      origin: { lat: 40.15, lon: -77.13 }
    })
    expect(searchPlaces).toHaveBeenCalledWith("Boiling Springs", expect.objectContaining({
      bias: { lat: 40.15, lon: -77.13 }
    }))
  })

  it("hunts gravel when the dual-sport rider asks for unpaved", async () => {
    const segments: CurvatureSegment[] = [
      { id: "paved-1", name: "PA 74", score: 900, surface: "asphalt", geometry: [[-76.8, 40.2], [-76.79, 40.21]] },
      { id: "gravel-1", name: "Pine Grove Road", score: 700, surface: "gravel", geometry: [[-76.82, 40.22], [-76.81, 40.23]] }
    ]
    const toolbox = createAdvisorToolbox({ queryRoads: () => segments })

    const unpaved = await toolbox.call("find_good_roads", { surface: "unpaved" }, { context, conversation: [] })
    expect(unpaved.places.map((entry) => entry.name)).toEqual(["Pine Grove Road"])
    expect(unpaved.content).toMatchObject({ roads: [expect.objectContaining({ unpaved: true })] })

    const paved = await toolbox.call("find_good_roads", { surface: "paved" }, { context, conversation: [] })
    expect(paved.places.map((entry) => entry.name)).toEqual(["PA 74"])
  })

  it("offers the road tool only where curvature data exists", () => {
    const withoutRoads = createAdvisorToolbox({})
    const withRoads = createAdvisorToolbox({ queryRoads: () => [] })
    const names = (toolbox: ReturnType<typeof createAdvisorToolbox>) =>
      toolbox.definitions({ context, conversation: [] }).map((definition) => definition.name)

    expect(names(withoutRoads)).toEqual(["find_stops", "lookup_place"])
    expect(names(withRoads)).toContain("find_good_roads")
  })
})

/**
 * A question that deliberately classifies as `tool-assisted`.
 *
 * The opening read (no rider message) is now a `route-only` turn: one request,
 * no declarations, answered from the briefing. Tests below that exercise the
 * tool loop, Maps grounding, or the prose fallback have to ask something that
 * actually needs a place looked up, or they would be asserting against a code
 * path the turn never enters.
 */
const TOOL_TURN = "Find a brewery near the halfway point."

describe("gemini adviser", () => {
  it("runs a grounded tool round, then asks for structured JSON without the built-in tool", async () => {
    const searchPlaces = vi.fn(async () => [photonResult])
    const { fetcher, calls } = stubGemini([
      functionCall("find_stops", { kind: "brewery", progress: 0.5 }),
      // With Maps grounding on, phase 1 cannot carry the answer schema, so the
      // model's prose here ends the tool rounds and phase 2 returns the JSON.
      { candidates: [{ content: { parts: [{ text: "Switchback Brewing is the one." }] } }] },
      answer({
        message: "Best Ride, and stop at Switchback Brewing — 22% of it is gravel anyway.",
        secondOpinion: {
          agreesWithSwitchback: true,
          wouldPick: "best-ride",
          rationale: "The gravel and the curve score are the whole point.",
          cautions: ["I could not check live traffic."],
          confidence: "medium"
        },
        proposedStops: [{ placeId: "osm-brewery-0-40.2000--76.8000", reason: "Right at the halfway point." }]
      })
    ])

    const adviser = createGeminiAdviser({
      apiKey: "test-key",
      fetcher,
      mapsGrounding: true,
      toolbox: createAdvisorToolbox({ searchPlaces: searchPlaces as never })
    })
    const reply = await adviser.advise({ context, conversation: [], riderMessage: TOOL_TURN })

    expect(reply.status).toBe("ok")
    expect(reply.secondOpinion?.wouldPick).toBe("best-ride")
    expect(reply.proposedStops).toHaveLength(1)
    expect(reply.proposedStops[0]!.anchor).toEqual({ lat: 40.2, lon: -76.8 })
    expect(reply.usage.toolCalls).toBe(1)

    // Phase 1 carries google_maps and the flag that lets it coexist with
    // function calling; phase 2 drops it, because the API rejects Maps
    // grounding combined with a JSON response mime type.
    const first = calls[0] as { tools: unknown[]; toolConfig: Record<string, unknown>; generationConfig: Record<string, unknown> }
    expect(first.tools).toContainEqual({ google_maps: {} })
    expect(first.toolConfig.include_server_side_tool_invocations).toBe(true)
    expect(first.generationConfig.responseMimeType).toBeUndefined()

    const last = calls.at(-1) as { tools?: unknown[]; generationConfig: Record<string, unknown> }
    // The answer-only pass offers no tools at all — not merely Maps minus the
    // built-in. Handing the model declarations it cannot be serviced on would
    // invite a tool call this pass will never execute.
    expect(last.tools).toBeUndefined()
    expect(last.generationConfig.responseMimeType).toBe("application/json")
    expect(last.generationConfig.responseJsonSchema).toBeDefined()
  })

  it("asks a model that answers, and caps how long it may think about it", async () => {
    // Both halves of this are load-bearing and neither is cosmetic. The model
    // this replaced answered 2 of 60 benchmark turns inside the 30s deadline —
    // the rest were timeouts and 503s — and leaving the thinking budget
    // unconstrained took the replacement from 42% of turns answered to 8%.
    // Evidence: docs/design/2026-09-04-advisor-provider-bakeoff.md.
    const { fetcher, calls, urls } = stubGemini([answer({ message: "Take the gravel." })])

    await createGeminiAdviser({
      apiKey: "test-key",
      fetcher,
      toolbox: createAdvisorToolbox({})
    }).advise({ context, conversation: [] })

    expect(urls[0]).toContain("/models/gemini-3.1-flash-lite:")
    expect(urls[0]).not.toContain("gemini-3.5-flash-lite")
    const config = (calls[0] as { generationConfig: Record<string, unknown> }).generationConfig
    expect(config.thinkingConfig).toEqual({ thinkingLevel: "low" })
  })

  it("still honours an explicitly configured model", async () => {
    const { fetcher, urls } = stubGemini([answer({ message: "Take the gravel." })])

    await createGeminiAdviser({
      apiKey: "test-key",
      model: "gemini-3.5-flash-lite",
      fetcher,
      toolbox: createAdvisorToolbox({})
    }).advise({ context, conversation: [] })

    expect(urls[0]).toContain("/models/gemini-3.5-flash-lite:")
  })

  it("keeps a hallucinated stop out of the reply even when the model insists", async () => {
    const { fetcher } = stubGemini([
      answer({
        message: "There's a great diner on this road.",
        proposedStops: [{ placeId: "the-diner-i-imagined", reason: "It is great." }]
      })
    ])
    const adviser = createGeminiAdviser({
      apiKey: "test-key",
      fetcher,
      toolbox: createAdvisorToolbox({})
    })
    const reply = await adviser.advise({ context, conversation: [] })

    expect(reply.status).toBe("ok")
    expect(reply.proposedStops).toEqual([])
  })

  it("carries Google Maps citations through to the reply so they can be attributed", async () => {
    const { fetcher } = stubGemini([
      {
        candidates: [{
          content: { parts: [{ functionCall: { id: "c1", name: "lookup_place", args: { query: "Cornerstone" } } }] },
          groundingMetadata: {
            groundingChunks: [{
              maps: { title: "Cornerstone Coffeehouse", uri: "https://maps.google.com/maps?cid=1" }
            }]
          }
        }]
      },
      { candidates: [{ content: { parts: [{ text: "Cornerstone it is." }] } }] },
      answer({ message: "Cornerstone is the one." })
    ])
    const adviser = createGeminiAdviser({
      apiKey: "k",
      fetcher,
      mapsGrounding: true,
      toolbox: createAdvisorToolbox({ searchPlaces: (async () => [photonResult]) as never })
    })
    const reply = await adviser.advise({ context, conversation: [], riderMessage: TOOL_TURN })

    expect(reply.usage.groundedQueries).toBe(1)
    expect(reply.citations).toContainEqual({
      title: "Cornerstone Coffeehouse",
      url: "https://maps.google.com/maps?cid=1",
      source: "google-maps"
    })
  })

  it("omits the Maps tool entirely when grounding is switched off", async () => {
    const { fetcher, calls } = stubGemini([answer({ message: "Looks good." })])
    const adviser = createGeminiAdviser({
      apiKey: "k",
      fetcher,
      mapsGrounding: false,
      toolbox: createAdvisorToolbox({})
    })
    await adviser.advise({ context, conversation: [], riderMessage: TOOL_TURN })

    const first = calls[0] as { tools: unknown[]; toolConfig: Record<string, unknown> }
    expect(first.tools).not.toContainEqual({ google_maps: {} })
    expect(first.toolConfig.include_server_side_tool_invocations).toBeUndefined()
  })

  it("builds a whole ride when the rider has no route yet", async () => {
    const searchPlaces = vi.fn(async (query: string) => [{
      ...photonResult,
      label: query,
      lat: query === "Gettysburg" ? 39.8309 : 40.2732,
      lon: query === "Gettysburg" ? -77.2311 : -76.8867
    }])
    const { fetcher } = stubGemini([
      functionCall("lookup_place", { query: "Harrisburg" }),
      functionCall("lookup_place", { query: "Gettysburg" }),
      answer({
        message: "Harrisburg down to Gettysburg the long way, about three hours.",
        proposedRide: {
          mode: "destination",
          profile: "adventure",
          targetMinutes: 180,
          startPlaceId: "geo-scenic-0-40.2732--76.8867",
          finishPlaceId: "geo-scenic-0-39.8309--77.2311",
          avoidHighways: true,
          tollPolicy: "avoid",
          summary: "Gravel-leaning run down to Gettysburg."
        }
      })
    ])

    const adviser = createGeminiAdviser({
      apiKey: "k",
      fetcher,
      toolbox: createAdvisorToolbox({ searchPlaces: searchPlaces as never })
    })
    const reply = await adviser.advise({
      context: null,
      conversation: [],
      riderMessage: "Three hours of gravel ending in Gettysburg",
      origin: { lat: 40.2732, lon: -76.8867 }
    })

    expect(reply.status).toBe("ok")
    expect(reply.proposedRide).toMatchObject({
      mode: "destination",
      profile: "adventure",
      targetMinutes: 180,
      avoidHighways: true
    })
    expect(reply.proposedRide?.start.lat).toBe(40.2732)
    expect(reply.proposedRide?.finish?.lat).toBe(39.8309)
  })

  it("degrades to a status instead of throwing", async () => {
    const toolbox = createAdvisorToolbox({})
    const failing = vi.fn(async () => new Response("nope", { status: 500 }))
    expect((await createGeminiAdviser({
      apiKey: "k", fetcher: failing as unknown as typeof fetch, toolbox
    }).advise({ context, conversation: [] })).status).toBe("unavailable")

    const throttled = vi.fn(async () => new Response("{}", { status: 429 }))
    expect((await createGeminiAdviser({
      apiKey: "k", fetcher: throttled as unknown as typeof fetch, toolbox
    }).advise({ context, conversation: [] })).status).toBe("rate-limited")

    const throwing = vi.fn(async () => { throw new Error("network down") })
    expect((await createGeminiAdviser({
      apiKey: "k", fetcher: throwing as unknown as typeof fetch, toolbox
    }).advise({ context, conversation: [] })).status).toBe("unavailable")
  })

  it("falls back to the advisor's own words when the structured pass fails", async () => {
    // Unparseable JSON, but the model did say something useful. Showing its
    // actual words beats showing an error; only the structured extras are lost.
    const { fetcher } = stubGemini([
      { candidates: [{ content: { parts: [{ text: "Take the gravel one, it's the whole point." }] } }] },
      { candidates: [{ content: { parts: [{ text: "still not json" }] } }] }
    ])
    const reply = await createGeminiAdviser({
      apiKey: "k", fetcher, toolbox: createAdvisorToolbox({})
    }).advise({ context, conversation: [], riderMessage: TOOL_TURN })

    expect(reply.status).toBe("ok")
    expect(reply.message).toBe("Take the gravel one, it's the whole point.")
    expect(reply.proposedStops).toEqual([])
    expect(reply.secondOpinion).toBeNull()
  })

  it("shows grounded prose only when the grounding pass produced a citable source", async () => {
    // With Maps grounding on, the prose may contain Maps-derived claims. Showing
    // it uncited would present a grounded claim as if Switchback had verified it.
    const uncited = stubGemini([
      { candidates: [{ content: { parts: [{ text: "The brewery there is excellent." }] } }] },
      { candidates: [{ content: { parts: [{ text: "still not json" }] } }] }
    ])
    expect((await createGeminiAdviser({
      apiKey: "k", fetcher: uncited.fetcher, mapsGrounding: true, toolbox: createAdvisorToolbox({})
    }).advise({ context, conversation: [], riderMessage: TOOL_TURN })).status).toBe("malformed")

    const cited = stubGemini([
      {
        candidates: [{
          content: { parts: [{ text: "The brewery there is excellent." }] },
          groundingMetadata: {
            groundingChunks: [{ maps: { title: "Switchback Brewing", uri: "https://maps.google.com/?cid=1" } }]
          }
        }]
      },
      { candidates: [{ content: { parts: [{ text: "still not json" }] } }] }
    ])
    const grounded = await createGeminiAdviser({
      apiKey: "k", fetcher: cited.fetcher, mapsGrounding: true, toolbox: createAdvisorToolbox({})
    }).advise({ context, conversation: [], riderMessage: TOOL_TURN })
    expect(grounded.status).toBe("ok")
    expect(grounded.message).toBe("The brewery there is excellent.")
    expect(grounded.citations.map((citation) => citation.source)).toContain("google-maps")
  })

  it("reports malformed when there is nothing usable to show at all", async () => {
    const { fetcher } = stubGemini([
      { candidates: [{ content: { parts: [{ text: "" }] } }] },
      { candidates: [{ content: { parts: [{ text: "" }] } }] }
    ])
    const reply = await createGeminiAdviser({
      apiKey: "k", fetcher, mapsGrounding: true, toolbox: createAdvisorToolbox({})
    }).advise({ context, conversation: [], riderMessage: TOOL_TURN })
    expect(reply.status).toBe("malformed")
    expect(reply.message).toBe("")
  })

  it("carries the prior conversation so the rider can go back and forth", async () => {
    const { fetcher, calls } = stubGemini([answer({ message: "Then take Fastest Now." })])
    await createGeminiAdviser({ apiKey: "k", fetcher, toolbox: createAdvisorToolbox({}) }).advise({
      context,
      conversation: [
        { role: "rider", text: "Anything with beer?" },
        { role: "advisor", text: "Switchback Brewing sits at the halfway point." }
      ],
      riderMessage: "Actually I'm short on time."
    })

    const contents = calls[0]!.contents as Array<{ role: string; parts: Array<{ text?: string }> }>
    expect(contents.map((entry) => entry.role)).toEqual(["user", "model", "user"])
    expect(contents[1]!.parts[0]!.text).toContain("Switchback Brewing")
    expect(contents.at(-1)!.parts[0]!.text).toBe("Actually I'm short on time.")
  })
})

describe("proactive nudges", () => {
  const fastest = route({
    id: "fastest-now",
    name: "Fastest Now",
    profile: "quick",
    durationMinutes: 60,
    twistiness: 34
  })

  it("says nothing about a plan the rider already understands", () => {
    const plain = route({ surfaceMix: { asphalt: 100 }, durationMinutes: 70, twistiness: 60 })
    const sibling = route({ id: "other", name: "Other", durationMinutes: 66, twistiness: 62 })
    expect(selectNudge({ routes: [plain, sibling], selectedRouteId: plain.id, dismissed: [] })).toBeNull()
  })

  it("leads with mapped gravel, because that is what this rider came for", () => {
    const gravel = route({ surfaceMix: { asphalt: 70, gravel: 30 } })
    const nudge = selectNudge({ routes: [gravel, fastest], selectedRouteId: gravel.id, dismissed: [] })
    expect(nudge?.kind).toBe("gravel-ahead")
    expect(nudge?.text).toContain("30%")
    // Every nudge names a number and opens a useful question.
    expect(nudge?.followUp.length).toBeGreaterThan(0)
  })

  it("offers a markedly twistier option once gravel is not in play", () => {
    const selected = route({ twistiness: 45, surfaceMix: { asphalt: 100 } })
    const twisty = route({ id: "twisty", name: "Maximum Twisties", twistiness: 88, durationMinutes: 100 })
    const nudge = selectNudge({ routes: [selected, twisty], selectedRouteId: selected.id, dismissed: [] })
    expect(nudge?.kind).toBe("much-twistier")
    expect(nudge?.text).toContain("88")
    expect(nudge?.routeId).toBe("twisty")
  })

  it("mentions a faster option only when the saving is material", () => {
    const selected = route({ durationMinutes: 88, twistiness: 60, surfaceMix: { asphalt: 100 } })
    const barelyFaster = route({ id: "b", name: "B", durationMinutes: 80, twistiness: 58 })
    expect(selectNudge({ routes: [selected, barelyFaster], selectedRouteId: selected.id, dismissed: [] }))
      .toBeNull()

    const muchFaster = route({ id: "c", name: "Fastest Now", durationMinutes: 60, twistiness: 58 })
    const nudge = selectNudge({ routes: [selected, muchFaster], selectedRouteId: selected.id, dismissed: [] })
    expect(nudge?.kind).toBe("faster-option")
    expect(nudge?.text).toContain("28 minutes")
  })

  it("shows one nudge at a time, and never a dismissed one again", () => {
    const gravel = route({ surfaceMix: { asphalt: 70, gravel: 30 }, twistiness: 45 })
    const twisty = route({ id: "twisty", name: "Twisty", twistiness: 88, durationMinutes: 100 })
    const first = selectNudge({ routes: [gravel, twisty], selectedRouteId: gravel.id, dismissed: [] })
    expect(first?.kind).toBe("gravel-ahead")

    const second = selectNudge({
      routes: [gravel, twisty],
      selectedRouteId: gravel.id,
      dismissed: [first!.id]
    })
    expect(second?.kind).toBe("much-twistier")

    expect(selectNudge({
      routes: [gravel, twisty],
      selectedRouteId: gravel.id,
      dismissed: [first!.id, second!.id]
    })).toBeNull()
  })

  it("is deterministic: the same plan always produces the same nudge", () => {
    const gravel = route({ surfaceMix: { asphalt: 70, gravel: 30 } })
    const input = { routes: [gravel, fastest], selectedRouteId: gravel.id, dismissed: [] }
    expect(selectNudge(input)).toEqual(selectNudge(input))
  })
})

describe("advisor capability gating", () => {
  it("is absent without a Gemini key", () => {
    expect(resolveAdvisorCapability({})).toEqual({ enabled: false, sources: [], attributions: [] })
    expect(createAdviserFromEnvironment({})).toBeNull()
  })

  it("turns Maps grounding on by default, since it is what makes the co-pilot useful", () => {
    const capability = resolveAdvisorCapability({ GEMINI_API_KEY: "key" })
    expect(capability.enabled).toBe(true)
    expect(capability.sources).toContain("google-maps")
    expect(capability.attributions).toContain("Grounded with Google Maps")
    expect(createAdviserFromEnvironment({ GEMINI_API_KEY: "key" })).not.toBeNull()
  })

  it("lets one variable switch Maps grounding off without losing the advisor", () => {
    const capability = resolveAdvisorCapability({ GEMINI_API_KEY: "key", GEMINI_MAPS_GROUNDING: "0" })
    expect(capability.enabled).toBe(true)
    expect(capability.sources).toEqual(["switchback-local"])
    expect(capability.attributions).not.toContain("Grounded with Google Maps")
  })

  it("adds the road tool only where a curvature database is configured", () => {
    expect(resolveAdvisorCapability({ GEMINI_API_KEY: "key" }).sources)
      .not.toContain("switchback-roads")
    expect(resolveAdvisorCapability({ GEMINI_API_KEY: "key", CURVATURE_DB_PATH: "data/curvature.sqlite" }).sources)
      .toContain("switchback-roads")
  })
})
