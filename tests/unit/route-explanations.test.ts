import { describe, expect, it } from "vitest"
import { explainRouteFacts, routeTradeoff } from "@/lib/recommendation/route-explanations"
import type { PlannedRoute } from "@/lib/routing/types"

function route(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "route",
    name: "Route",
    profile: "adventure",
    geometry: [[-76.9, 40.2], [-76.7, 40.3]],
    waypoints: [],
    instructions: [],
    distanceMiles: 100,
    durationMinutes: 120,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 70,
    turnCount: 20,
    roadMix: { secondary: 30, motorway: 10 },
    surfaceMix: { gravel: 25, unknown: 5, asphalt: 70 },
    routingSource: "live",
    previewOnly: false,
    ...overrides
  }
}

describe("factual route explanations", () => {
  it("reports measured surface, road class, and peer duration facts", () => {
    const facts = explainRouteFacts(route(), [route({ id: "fast", durationMinutes: 102 })])

    expect(facts).toEqual(expect.arrayContaining([
      "Adds about 18 minutes versus the fastest candidate.",
      "25.0 mi mapped gravel or unpaved surface.",
      "5% of mapped surface coverage is unknown.",
      "30.0 mi mapped secondary, tertiary, or unclassified road."
    ]))
  })

  it("labels source provenance without inventing confidence or legality", () => {
    const facts = explainRouteFacts(route({ candidateSource: "rig" }))

    expect(facts).toContain("Built from a verified RIG corridor anchor.")
    expect(facts.join(" ")).not.toMatch(/legal|high-confidence|safe/i)
  })

  it("reports a tie without inventing a minute of delay", () => {
    const candidate = route({ id: "candidate", distanceMiles: 104, durationMinutes: 120 })

    expect(routeTradeoff(candidate, [route({ id: "fast", durationMinutes: 120 }), candidate])).toBe(
      "Same time as fastest · +4.0 mi vs fastest"
    )
  })
})
