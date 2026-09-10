import { describe, expect, it } from "vitest"
import {
  advisorActionPrompt,
  classifyAdvisorAction,
  enforceAdvisorActionReply,
  resolveAdvisorClientAction
} from "@/lib/advice/action-policy"
import type { AdvisorRouteEvidence } from "@/lib/advice/action-policy"
import { classifyTurn } from "@/lib/advice/execution-policy"
import { createRoutedAdviser } from "@/lib/advice/router"
import { createAdvisorToolbox } from "@/lib/advice/toolbox"
import type {
  AdviceRequest,
  AdvisorReply,
  AdvisorRouteContext,
  ProposedStop
} from "@/lib/advice/contracts"
import type { AdvisorProvider } from "@/lib/advice/provider"

const context: AdvisorRouteContext = {
  selectedRouteId: "current",
  candidates: [
    {
      id: "current",
      name: "Current route",
      profile: "balanced",
      distanceMiles: 42,
      durationMinutes: 88,
      twistiness: 54,
      turnCount: 81,
      geometry: [[-75.16, 40.18], [-75.28, 40.31]],
      roadMix: {},
      surfaceMix: {}
    },
    {
      id: "better",
      name: "Creek Road option",
      profile: "adventure",
      distanceMiles: 45,
      durationMinutes: 94,
      twistiness: 72,
      turnCount: 116,
      geometry: [[-75.16, 40.18], [-75.18, 40.22], [-75.28, 40.31]],
      roadMix: {},
      surfaceMix: { gravel: 0.28 }
    }
  ],
  geometry: [[-75.16, 40.18], [-75.28, 40.31]],
  warnings: []
}

function ask(riderMessage: string, routeContext: AdvisorRouteContext | null = context): AdviceRequest {
  return { context: routeContext, conversation: [], riderMessage }
}

function reply(overrides: Partial<AdvisorReply> = {}): AdvisorReply {
  return {
    status: "ok",
    message: "Fine.",
    secondOpinion: null,
    proposedStops: [],
    proposedRide: null,
    citations: [],
    usage: { toolCalls: 0, groundedQueries: 0 },
    ...overrides
  }
}

const foodStop: ProposedStop = {
  id: "osm-food-1",
  name: "Actual Diner",
  reason: "Model-authored reason that is deliberately not trusted for the action copy.",
  kind: "food",
  anchor: { lat: 40.245, lon: -75.22 },
  routeProgress: 0.53,
  citations: [{
    title: "OpenStreetMap",
    url: "https://www.openstreetmap.org/",
    source: "switchback-local"
  }]
}

describe("Gravel Goblin action classification", () => {
  it.each([
    "Find me better route with stop",
    "Find me a better ride with something good to eat on the way",
    "Reroute me with a coffee stop"
  ])("treats %j as a route-with-stop action", (message) => {
    expect(classifyAdvisorAction(ask(message))).toBe("route-with-stop")
  })

  it("treats a stop-only imperative as an add-stop action", () => {
    expect(classifyAdvisorAction(ask("Add a brewery to this route"))).toBe("add-stop")
  })

  it.each([
    "What if I find a better route with a good food stop?",
    "If I add a brewery, will this route improve?",
    "Would a better route with lunch be worth it?",
    "Is there a better route with food?",
    "Would you reroute me with a coffee?"
  ])("keeps hypothetical route-and-stop questions non-mutating: %j", (message) => {
    expect(classifyAdvisorAction(ask(message))).toBe("chat")
  })

  it.each([
    "Honestly, would you reroute me with a coffee?",
    "I don't want to reroute this route with food.",
    "Could a better route with coffee be worth it?"
  ])("keeps conversational or negative route-and-stop language non-mutating: %j", (message) => {
    expect(classifyAdvisorAction(ask(message))).toBe("chat")
  })

  it("keeps exploratory stop questions suggestion-only", () => {
    expect(classifyAdvisorAction(ask("Anywhere good to stop?"))).toBe("stop-scout")
    expect(classifyAdvisorAction(ask("Find coffee around halfway"))).toBe("stop-scout")
  })

  it("distinguishes a reroute command from a route opinion", () => {
    expect(classifyAdvisorAction(ask("Find me a better route"))).toBe("reroute")
    expect(classifyAdvisorAction(ask("Reroute this"))).toBe("reroute")
    expect(classifyAdvisorAction(ask("Switch the route"))).toBe("reroute")
    expect(classifyAdvisorAction(ask("Which route would you take?"))).toBe("chat")
    expect(classifyAdvisorAction(ask("Would a better route be worth it?"))).toBe("chat")
    expect(classifyAdvisorAction(ask("Is there a better route?"))).toBe("chat")
  })

  it("uses the one-shot execution path for a pure reroute but tools for a stop action", () => {
    expect(classifyTurn(ask("Find me a better route"))).toBe("route-only")
    expect(classifyTurn(ask("Find me a better route with lunch"))).toBe("tool-assisted")
  })

  it("treats a no-route conversation as ride building", () => {
    expect(classifyAdvisorAction(ask("Three hours of gravel and lunch", null))).toBe("build-ride")
  })
})

describe("Gravel Goblin action evidence boundary", () => {
  it("does not let invented prose survive when a requested stop was not grounded", () => {
    const result = enforceAdvisorActionReply(
      ask("Find me a better route with a food stop"),
      reply({ message: "Take Maple & Main Café via a secret ridge road. I already rerouted it." })
    )

    expect(result.message).not.toMatch(/Maple|secret ridge|already rerouted/i)
    expect(result.message).toMatch(/couldn.t ground|unchanged/i)
    expect(result.proposedStops).toEqual([])
  })

  it("builds action copy only from the resolved stop and normalizes its reason", () => {
    const result = enforceAdvisorActionReply(
      ask("Reroute me with food"),
      reply({
        message: "Use Made Up Cafe on Imaginary Road.",
        proposedStops: [foodStop]
      })
    )

    expect(result.message).toContain("Actual Diner")
    expect(result.message).not.toMatch(/Made Up|Imaginary Road/)
    expect(result.proposedStops[0]?.reason).toBe("Mapped food stop around 53% along the route.")
    expect(result.secondOpinion).toBeNull()
  })

  it("keeps a verified route opinion attached to a compound route-and-stop action", () => {
    const input = ask("Find me a better route with a food stop")
    const result = enforceAdvisorActionReply(input, reply({
      proposedStops: [foodStop],
      secondOpinion: {
        agreesWithSwitchback: false,
        wouldPick: "better",
        rationale: "More curves on the verified candidate.",
        cautions: [],
        confidence: "medium"
      }
    }))

    expect(result.secondOpinion?.wouldPick).toBe("better")
    expect(resolveAdvisorClientAction(input, result)).toEqual({
      type: "route-with-stop",
      stop: result.proposedStops[0]
    })
  })

  it("does not auto-apply a compound action without a verified route opinion", () => {
    const input = ask("Find me a better route with a food stop")
    const result = enforceAdvisorActionReply(input, reply({ proposedStops: [foodStop] }))

    expect(result.message).toMatch(/better verified route|unchanged/i)
    expect(resolveAdvisorClientAction(input, result)).toBeNull()
  })

  it("rejects a different id when local geometry proves the candidate is identical", () => {
    const input = ask("Find me a better route")
    const evidence: AdvisorRouteEvidence = {
      selected: { id: "current", geometry: [[-75.16, 40.18], [-75.28, 40.31]] },
      candidates: [{ id: "current", geometry: [[-75.16, 40.18], [-75.28, 40.31]] }, {
        id: "better",
        geometry: [[-75.16, 40.18], [-75.28, 40.31]]
      }]
    }
    const guarded = enforceAdvisorActionReply(input, reply({
      secondOpinion: {
        agreesWithSwitchback: false,
        wouldPick: "better",
        rationale: "Different id only.",
        cautions: [],
        confidence: "medium"
      }
    }), evidence)

    expect(guarded.message).toMatch(/don.t have a better verified route candidate/i)
    expect(guarded.secondOpinion).toBeNull()
    expect(resolveAdvisorClientAction(input, guarded, evidence)).toBeNull()
  })

  it("rejects an identical candidate from request geometry at the server policy boundary", () => {
    const duplicateContext: AdvisorRouteContext = {
      ...context,
      candidates: context.candidates.map((candidate) => ({
        ...candidate,
        geometry: [[-75.16, 40.18], [-75.28, 40.31]]
      }))
    }
    const input = ask("Find me a better route", duplicateContext)
    const guarded = enforceAdvisorActionReply(input, reply({
      secondOpinion: {
        agreesWithSwitchback: false,
        wouldPick: "better",
        rationale: "Different id only.",
        cautions: [],
        confidence: "medium"
      }
    }))

    expect(guarded.secondOpinion).toBeNull()
    expect(guarded.message).toMatch(/don.t have a better verified route candidate/i)
  })

  it("accepts a different candidate when local geometry proves it is distinct", () => {
    const input = ask("Find me a better route")
    const evidence: AdvisorRouteEvidence = {
      selected: { id: "current", geometry: [[-75.16, 40.18], [-75.28, 40.31]] },
      candidates: [{ id: "current", geometry: [[-75.16, 40.18], [-75.28, 40.31]] }, {
        id: "better",
        geometry: [[-75.16, 40.18], [-75.18, 40.22], [-75.28, 40.31]]
      }]
    }
    const guarded = enforceAdvisorActionReply(input, reply({
      secondOpinion: {
        agreesWithSwitchback: false,
        wouldPick: "better",
        rationale: "More curves.",
        cautions: [],
        confidence: "medium"
      }
    }), evidence)

    expect(guarded.secondOpinion?.wouldPick).toBe("better")
    expect(resolveAdvisorClientAction(input, guarded, evidence)).toEqual({ type: "select-route", routeId: "better" })
  })

  it("refuses to describe an imaginary reroute when no different candidate was verified", () => {
    const result = enforceAdvisorActionReply(
      ask("Find me a better route"),
      reply({ message: "I made a much better ridge loop for you." })
    )

    expect(result.message).toMatch(/don.t have a better verified route candidate/i)
    expect(result.message).not.toMatch(/ridge loop/i)
  })

  it("names only a real candidate and removes model-authored route rationale", () => {
    const result = enforceAdvisorActionReply(
      ask("Find me a better route"),
      reply({
        message: "Try Fantasy Mountain Road.",
        secondOpinion: {
          agreesWithSwitchback: false,
          wouldPick: "better",
          rationale: "Fantasy Mountain Road is freshly paved and perfect today.",
          cautions: ["Imaginary closure on Secret Ridge."],
          confidence: "high"
        }
      })
    )

    expect(result.message).toContain("Creek Road option")
    expect(result.message).not.toContain("Fantasy Mountain Road")
    expect(result.secondOpinion?.rationale).toBe("45 mi · 94 min · curve score 72/100 · 6 min longer.")
    expect(result.secondOpinion?.cautions).toEqual([])
  })

  it("asks for the missing start instead of echoing model guesses when building without an origin", () => {
    const result = enforceAdvisorActionReply(
      ask("Build me a three hour gravel loop", null),
      reply({ message: "Start in Imaginaryville and take Secret Ridge." })
    )
    expect(result.message).toBe("Where should the ride start?")
  })

  it("caps ordinary model prose at 80 words", () => {
    const result = enforceAdvisorActionReply(
      ask("What do you think of this ride?"),
      reply({ message: Array.from({ length: 110 }, (_, index) => `word${index}`).join(" ") })
    )
    expect(result.message.split(/\s+/)).toHaveLength(80)
  })
})

describe("Gravel Goblin router integration", () => {
  it("applies the evidence gate after a provider returns an action answer", async () => {
    const provider: AdvisorProvider = {
      id: "gemini",
      async runTurn() {
        return {
          modelId: "stub",
          reply: reply({
            message: "Take Maple & Main Café on Secret Ridge. I rerouted it already.",
            proposedStops: []
          })
        }
      }
    }
    const adviser = createRoutedAdviser({
      toolbox: createAdvisorToolbox({}),
      providers: [provider],
      preference: "auto",
      mapsGrounding: false
    })

    const result = await adviser.advise(ask("Find me a better route with food"))
    expect(result.message).toMatch(/couldn.t ground|unchanged/i)
    expect(result.message).not.toMatch(/Maple|Secret Ridge|rerouted it/i)
  })
})

describe("Gravel Goblin client action handoff", () => {
  it("auto-applies the grounded stop for an explicit route-with-stop command", () => {
    const input = ask("Find me better route with stop")
    const guarded = enforceAdvisorActionReply(input, reply({
      proposedStops: [foodStop],
      secondOpinion: {
        agreesWithSwitchback: false,
        wouldPick: "better",
        rationale: "More curves.",
        cautions: [],
        confidence: "medium"
      }
    }))
    expect(resolveAdvisorClientAction(input, guarded)).toEqual({ type: "route-with-stop", stop: guarded.proposedStops[0] })
  })

  it("auto-selects only a verified different candidate for a reroute command", () => {
    const input = ask("Reroute this with a better route")
    const guarded = enforceAdvisorActionReply(input, reply({
      secondOpinion: {
        agreesWithSwitchback: false,
        wouldPick: "better",
        rationale: "More curves.",
        cautions: [],
        confidence: "medium"
      }
    }))
    expect(resolveAdvisorClientAction(input, guarded)).toEqual({ type: "select-route", routeId: "better" })
  })

  it("does not auto-apply an exploratory stop suggestion or route question", () => {
    const stopInput = ask("Anywhere good to stop?")
    const guardedStop = enforceAdvisorActionReply(stopInput, reply({ proposedStops: [foodStop] }))
    expect(resolveAdvisorClientAction(stopInput, guardedStop)).toBeNull()

    const routeQuestion = ask("Would a better route be worth it?")
    expect(resolveAdvisorClientAction(routeQuestion, reply({
      secondOpinion: {
        agreesWithSwitchback: false,
        wouldPick: "better",
        rationale: "Maybe.",
        cautions: [],
        confidence: "low"
      }
    }))).toBeNull()
  })

  it("hands a grounded stop-only imperative to the existing add-stop callback", () => {
    const input = ask("Add a brewery to this route")
    const guarded = enforceAdvisorActionReply(input, reply({ proposedStops: [foodStop] }))

    expect(guarded.message).toMatch(/Actual Diner.*ready to add/i)
    expect(resolveAdvisorClientAction(input, guarded)).toEqual({ type: "add-stop", stop: guarded.proposedStops[0] })
  })
})

describe("Gravel Goblin action prompt", () => {
  it("makes route-with-stop turns tool-first and forbids claiming planner mutation", () => {
    const prompt = advisorActionPrompt(ask("Find me better route with stop"))
    expect(prompt).toMatch(/ACTION CONTRACT/i)
    expect(prompt).toMatch(/find_stops/i)
    expect(prompt).toMatch(/do not claim.*route.*changed/i)
  })
})
