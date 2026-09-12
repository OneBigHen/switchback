import { describe, expect, it } from "vitest"
import {
  classifyAdvisorAction,
  resolveAdvisorClientAction,
  type AdvisorRouteEvidence
} from "@/lib/advice/action-policy"
import type {
  AdviceRequest,
  AdvisorReply,
  AdvisorRouteContext
} from "@/lib/advice/contracts"

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
      id: "duplicate-id-only",
      name: "Duplicate route",
      profile: "balanced",
      distanceMiles: 42,
      durationMinutes: 88,
      twistiness: 54,
      turnCount: 81,
      geometry: [[-75.16, 40.18], [-75.28, 40.31]],
      roadMix: {},
      surfaceMix: {}
    }
  ],
  geometry: [[-75.16, 40.18], [-75.28, 40.31]],
  warnings: []
}

function ask(riderMessage: string): AdviceRequest {
  return { context, conversation: [], riderMessage }
}

function rerouteReply(): AdvisorReply {
  return {
    status: "ok",
    message: "Use the duplicate.",
    secondOpinion: {
      agreesWithSwitchback: false,
      wouldPick: "duplicate-id-only",
      rationale: "Different id.",
      cautions: [],
      confidence: "medium"
    },
    proposedStops: [],
    proposedRide: null,
    citations: [],
    usage: { toolCalls: 0, groundedQueries: 0 }
  }
}

describe("advisor mutation authority adversarial cases", () => {
  it.each([
    "Coffee with a view sounds good.",
    "I'm thinking about food with a view.",
    "A brewery via the river sounds fun.",
    "Never reroute me.",
    "I hate when routes take me through towns."
  ])("does not turn non-imperative language into a planner mutation: %j", (message) => {
    expect(["reroute", "route-with-stop", "add-stop"]).not.toContain(classifyAdvisorAction(ask(message)))
  })

  it.each([
    "Add coffee if there is time",
    "Reroute me through a brewery if it is open"
  ])("does not execute a conditional imperative without a condition evaluator: %j", (message) => {
    expect(classifyAdvisorAction(ask(message))).toBe("chat")
  })

  it.each([
    ["Add a brewery to this route", "add-stop"],
    ["Include coffee on the way", "add-stop"],
    ["Route me through Pine Diner", "route-with-stop"]
  ] as const)("preserves explicit command semantics: %j", (message, expected) => {
    expect(classifyAdvisorAction(ask(message))).toBe(expected)
  })

  it.each([
    "Reroute me without coffee",
    "Reroute me to avoid the brewery",
    "Take me away from the park"
  ])("never turns an excluded place category into an added stop: %j", (message) => {
    expect(classifyAdvisorAction(ask(message))).toBe("reroute")
  })

  it("refuses a direct pure-reroute action when only the route id differs", () => {
    const geometry = [[-75.16, 40.18], [-75.28, 40.31]] as [number, number][]
    const evidence: AdvisorRouteEvidence = {
      selected: { id: "current", geometry },
      candidates: [
        { id: "current", geometry },
        { id: "duplicate-id-only", geometry: [...geometry] }
      ]
    }

    expect(resolveAdvisorClientAction(ask("Reroute this"), rerouteReply(), evidence)).toBeNull()
  })
})
