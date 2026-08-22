import { describe, expect, it, vi } from "vitest"
import { normalizeRouteRequest } from "@/lib/domain/routing/normalized-request"
import { planSegmentedTrip } from "@/lib/routing/planner-segmented"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"
import type { RouteCandidateEnricher, RoutingResult } from "@/lib/routing/planner-contract"

function route(request: RouteRequest, id: string, durationMinutes: number): PlannedRoute {
  return {
    id,
    name: `${request.profile} route`,
    profile: request.profile,
    geometry: request.points.map((point) => [point.lon, point.lat]),
    waypoints: request.points.map((point) => ({ ...point })),
    instructions: [],
    distanceMiles: durationMinutes,
    durationMinutes,
    ascentMeters: null,
    descentMeters: null,
    twistiness: request.profile === "adventure" ? 80 : 60,
    turnCount: 4,
    roadMix: { secondary: 100 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    previewOnly: false
  }
}

describe("segmented planner strategy", () => {
  it("preserves leg call order, selects each leg winner, and merges enrichment warnings", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<RoutingResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [
        route(request, `${request.profile}-loser`, 99),
        route(request, `${request.profile}-winner`, request.profile === "twisty" ? 12 : 18)
      ]
    }))
    const enricher: RouteCandidateEnricher = vi.fn(async (_request: RouteRequest, routes: PlannedRoute[]) => ({
      routes: routes.map((candidate) => ({ ...candidate, name: `${candidate.name} enriched` })),
      warnings: ["enrichment warning"]
    }))
    const request = normalizeRouteRequest({
      profile: "twisty",
      planningId: "plan-1",
      candidateSet: "primary",
      compare: true,
      points: [
        { lat: 40.2, lon: -76.9, label: "Start" },
        { lat: 40.25, lon: -76.8, label: "Middle" },
        { lat: 40.3, lon: -76.7, label: "Finish" }
      ],
      segmentProfiles: ["twisty", "adventure"]
    } as RouteRequest & { compare: true })

    const plan = await planSegmentedTrip(request, provider, enricher)

    expect(provider.mock.calls.map(([call]) => call.profile)).toEqual(["twisty", "adventure"])
    expect(plan.selectedRouteId).toBe("mixed-twisty-winner-adventure-winner")
    expect(plan.routes[0]).toMatchObject({
      name: "Custom Twisty / Adventure route enriched",
      distanceMiles: 30,
      durationMinutes: 30,
      segmentProfiles: ["twisty", "adventure"],
      overlapPercent: 100
    })
    expect(plan.planningId).toBe("plan-1")
    expect(plan.candidateSet).toBe("primary")
    expect(plan.warnings).toEqual([
      "Per-leg riding styles create one deliberate route, so comparison alternatives are hidden.",
      "enrichment warning"
    ])
  })
})
