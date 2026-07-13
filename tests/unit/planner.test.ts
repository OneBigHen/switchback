import { describe, expect, it, vi } from "vitest"
import { planMotorcycleTrip } from "@/lib/routing/planner"
import type { GraphHopperResult } from "@/lib/routing/graphhopper"
import type { PlannedRoute, RouteProfileId, RouteRequest } from "@/lib/routing/types"

function route(profile: RouteProfileId, latitudeOffset = 0): PlannedRoute {
  return {
    id: `${profile}-route`,
    name: `${profile} route`,
    profile,
    geometry: [
      [-76.9, 40.2 + latitudeOffset],
      [-76.8, 40.2 + latitudeOffset],
      [-76.7, 40.2 + latitudeOffset]
    ],
    waypoints: [],
    instructions: [],
    distanceMiles: 20,
    durationMinutes: 35,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 50,
    turnCount: 12,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

describe("trip planner", () => {
  it("requests a selected route plus useful comparison profiles", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [route(request.profile, request.profile === "quick" ? 0.01 : request.profile === "twisty" ? 0.02 : 0)]
    }))

    const plan = await planMotorcycleTrip(
      {
        profile: "scenic",
        compare: true,
        points: [
          { lat: 40.2, lon: -76.9, label: "Start" },
          { lat: 40.2, lon: -76.7, label: "Finish" }
        ]
      },
      provider
    )

    expect(provider.mock.calls.map(([request]) => request.profile)).toEqual([
      "scenic",
      "twisty",
      "quick"
    ])
    expect(plan.routes[0].profile).toBe("scenic")
    expect(plan.selectedRouteId).toBe("scenic-route")
    expect(plan.routes[1].overlapPercent).toBeLessThan(100)
  })

  it("drops a comparison route whose geometry duplicates the selected route", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [route(request.profile, request.profile === "quick" ? 0.03 : 0)]
    }))

    const plan = await planMotorcycleTrip(
      {
        profile: "twisty",
        compare: true,
        points: [
          { lat: 40.2, lon: -76.9 },
          { lat: 40.2, lon: -76.7 }
        ]
      },
      provider
    )

    expect(plan.routes.map((candidate) => candidate.profile)).toEqual(["twisty", "quick"])
    expect(plan.warnings.join(" ")).toMatch(/duplicate scenic/i)
  })

  it("keeps the selected route usable when an optional comparison provider fails", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      if (request.profile === "twisty") throw new Error("profile unavailable")
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [route(request.profile, request.profile === "quick" ? 0.02 : 0)]
      }
    })

    const plan = await planMotorcycleTrip(
      {
        profile: "scenic",
        compare: true,
        points: [
          { lat: 40.2, lon: -76.9 },
          { lat: 40.2, lon: -76.7 }
        ]
      },
      provider
    )

    expect(plan.routes[0].profile).toBe("scenic")
    expect(plan.warnings.join(" ")).toMatch(/twisty.*unavailable/i)
  })
})
