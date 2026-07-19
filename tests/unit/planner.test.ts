import { describe, expect, it, vi } from "vitest"
import { planMotorcycleTrip, type RoutingResult } from "@/lib/routing/planner"
import type { GraphHopperResult } from "@/lib/routing/graphhopper"
import type { PlannedRoute, RouteProfileId, RouteRequest } from "@/lib/routing/types"

function route(profile: RouteProfileId, latitudeOffset = 0, id = `${profile}-route`): PlannedRoute {
  return {
    id,
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
  it("composes a legal route from rider-selected profiles for each leg", async () => {
    const start = { lat: 40.2, lon: -76.9, label: "Start" }
    const overlook = { lat: 40.25, lon: -76.8, label: "Overlook", locked: true }
    const finish = { lat: 40.3, lon: -76.7, label: "Finish" }
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [{
        ...route(request.profile, request.profile === "adventure" ? 0.01 : 0, `${request.profile}-leg`),
        geometry: [
          [request.points[0]!.lon, request.points[0]!.lat],
          [request.points[1]!.lon, request.points[1]!.lat]
        ],
        distanceMiles: request.profile === "twisty" ? 12 : 18,
        durationMinutes: request.profile === "twisty" ? 22 : 35,
        turnCount: request.profile === "twisty" ? 18 : 7,
        twistiness: request.profile === "twisty" ? 82 : 35,
        roadMix: request.profile === "adventure" ? { unclassified: 80 } : { secondary: 100 },
        surfaceMix: request.profile === "adventure" ? { gravel: 80, asphalt: 20 } : { asphalt: 100 }
      }]
    }))

    const plan = await planMotorcycleTrip({
      profile: "twisty",
      compare: true,
      points: [start, overlook, finish],
      segmentProfiles: ["twisty", "adventure"]
    } as RouteRequest, provider)

    expect(provider).toHaveBeenCalledTimes(2)
    expect(provider.mock.calls.map(([request]) => request.profile)).toEqual(["twisty", "adventure"])
    expect(plan.routes).toHaveLength(1)
    expect(plan.routes[0]).toMatchObject({
      profile: "twisty",
      segmentProfiles: ["twisty", "adventure"],
      distanceMiles: 30,
      durationMinutes: 57,
      waypoints: [start, overlook, finish]
    })
    expect(plan.routes[0].geometry).toEqual([
      [-76.9, 40.2],
      [-76.8, 40.25],
      [-76.7, 40.3]
    ])
  })

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
      "quick",
      "twisty",
      "adventure"
    ])
    expect(plan.routes[0].profile).toBe("scenic")
    expect(plan.selectedRouteId).toBe("scenic-route")
    expect(plan.routes[1].overlapPercent).toBeLessThan(100)
  })

  it("chooses the least-overlapping provider alternative for each route personality", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: request.profile === "quick"
        ? [route("quick", 0.001, "quick-primary"), route("quick", 0.05, "quick-distinct")]
        : [route(request.profile, request.profile === "twisty" ? 0.02 : request.profile === "adventure" ? -0.04 : 0)]
    }))

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      compare: true,
      points: [
        { lat: 40.2, lon: -76.9 },
        { lat: 40.2, lon: -76.7 }
      ]
    }, provider)

    expect(plan.routes.find((candidate) => candidate.profile === "quick")?.id).toBe("quick-distinct")
    expect(plan.routes).toHaveLength(4)
  })

  it("preserves distinct same-profile alternatives instead of collapsing provider variety", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: request.profile === "scenic"
        ? [
            route("scenic", 0, "scenic-primary"),
            route("scenic", 0.04, "scenic-river"),
            route("scenic", -0.04, "scenic-ridge")
          ]
        : [route(request.profile, 0)]
    }))

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      compare: true,
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.2, lon: -76.7 }]
    }, provider)

    expect(plan.routes.filter((candidate) => candidate.profile === "scenic").map((candidate) => candidate.id))
      .toEqual(["scenic-primary", "scenic-river", "scenic-ridge"])
  })

  it("prefers official-road evidence among already-distinct Adventure comparisons", async () => {
    const official = {
      ...route("adventure", 0.03, "adventure-official"),
      geometry: [
        [-76.9, 40.2],
        [-76.8, 40.2],
        [-76.7, 40.23]
      ] as [number, number][],
      officialUnpavedEvidence: {
        source: "Pennsylvania Department of Environmental Protection" as const,
        dataset: "Unpaved Roads 2009_07" as const,
        matchedMeters: 1_200,
        sharePercent: 3,
        matchedFeatureCount: 2,
        matchRadiusMeters: 40,
        minimumContiguousMeters: 80
      }
    }
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: request.profile === "adventure"
        ? [official, route("adventure", 0.05, "adventure-farthest")]
        : [route(request.profile, request.profile === "quick" ? 0.01 : request.profile === "twisty" ? -0.02 : 0)]
    }))

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      compare: true,
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.2, lon: -76.7 }]
    }, provider)

    expect(plan.routes.find((candidate) => candidate.profile === "adventure")?.id)
      .toBe("adventure-official")
  })

  it("selects the gravel-rich alternative for an adventure request", async () => {
    const paved = { ...route("adventure", 0, "paved-adventure"), surfaceMix: { asphalt: 100 } }
    const gravel = {
      ...route("adventure", 0.02, "gravel-adventure"),
      durationMinutes: 44,
      surfaceMix: { asphalt: 25, gravel: 60, dirt: 15 }
    }
    const provider = vi.fn(async (): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [paved, gravel]
    }))

    const plan = await planMotorcycleTrip({
      profile: "adventure",
      compare: false,
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.3, lon: -76.7 }]
    }, provider)

    expect(plan.selectedRouteId).toBe("gravel-adventure")
  })

  it("lets positive official PA unpaved-road evidence change the Adventure winner", async () => {
    const mappedGravel = {
      ...route("adventure", 0.02, "osm-gravel"),
      surfaceMix: { gravel: 2, asphalt: 98 }
    }
    const officialRoad = {
      ...route("adventure", 0, "pasda-gravel"),
      surfaceMix: { asphalt: 100 }
    }
    const provider = vi.fn(async (): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [mappedGravel, officialRoad]
    }))
    const enricher = vi.fn(async (_request: RouteRequest, routes: PlannedRoute[]) => ({
      routes: routes.map((candidate) => candidate.id === "pasda-gravel" ? {
        ...candidate,
        officialUnpavedEvidence: {
          source: "Pennsylvania Department of Environmental Protection" as const,
          dataset: "Unpaved Roads 2009_07" as const,
          matchedMeters: 900,
          sharePercent: 2,
          matchedFeatureCount: 1,
          matchRadiusMeters: 40,
          minimumContiguousMeters: 120
        }
      } : candidate),
      warnings: []
    }))

    const plan = await planMotorcycleTrip({
      profile: "adventure",
      compare: false,
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.3, lon: -76.7 }]
    }, provider, enricher)

    expect(enricher).toHaveBeenCalledOnce()
    expect(plan.selectedRouteId).toBe("pasda-gravel")
  })

  it("samples several time-matched Adventure loops before applying official-road evidence once", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      const seed = request.roundTrip?.seed ?? 0
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [{
          ...route("adventure", seed / 10_000, `adventure-${seed}`),
          durationMinutes: 120
        }]
      }
    })
    const enricher = vi.fn(async (_request: RouteRequest, routes: PlannedRoute[]) => ({
      routes: routes.map((candidate, index) => index === routes.length - 1 ? {
        ...candidate,
        officialUnpavedEvidence: {
          source: "Pennsylvania Department of Environmental Protection" as const,
          dataset: "Unpaved Roads 2009_07" as const,
          matchedMeters: 1_200,
          sharePercent: 3,
          matchedFeatureCount: 2,
          matchRadiusMeters: 40,
          minimumContiguousMeters: 80
        }
      } : candidate),
      warnings: []
    }))

    const plan = await planMotorcycleTrip({
      profile: "adventure",
      compare: false,
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 45 }
    }, provider, enricher)

    expect(provider).toHaveBeenCalledTimes(4)
    expect(enricher).toHaveBeenCalledOnce()
    expect(enricher.mock.calls[0][1]).toHaveLength(4)
    expect(plan.selectedRouteId).toBe("adventure-320")
  })

  it("never lets gravel scoring displace an Adventure loop that is inside the requested timebox", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      const seed = request.roundTrip?.seed ?? 0
      const durationMinutes = seed === 17
        ? 137
        : seed === 118
          ? 141
          : seed === 219
            ? 140
            : 142
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [{
          ...route("adventure", seed / 10_000, `adventure-${seed}`),
          durationMinutes
        }]
      }
    })
    const enricher = vi.fn(async (_request: RouteRequest, routes: PlannedRoute[]) => ({
      routes: routes.map((candidate) => candidate.id === "adventure-320" ? {
        ...candidate,
        officialUnpavedEvidence: {
          source: "Pennsylvania Department of Environmental Protection" as const,
          dataset: "Unpaved Roads 2009_07" as const,
          matchedMeters: 8_000,
          sharePercent: 50,
          matchedFeatureCount: 20,
          matchRadiusMeters: 40,
          minimumContiguousMeters: 80
        }
      } : candidate),
      warnings: []
    }))

    const plan = await planMotorcycleTrip({
      profile: "adventure",
      compare: false,
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 45 }
    }, provider, enricher)

    expect(plan.selectedRouteId).toBe("adventure-17")
    expect(plan.routes[0].durationMinutes).toBe(137)
    expect(plan.warnings).toEqual([])
  })

  it("varies round-trip seeds across route personalities", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      const candidate = route(request.profile, (request.roundTrip?.seed ?? 0) / 10_000)
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [{ ...candidate, durationMinutes: request.roundTrip?.targetMinutes ?? candidate.durationMinutes }]
      }
    })

    await planMotorcycleTrip({
      profile: "twisty",
      compare: true,
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 45 }
    }, provider)

    expect(provider.mock.calls.map(([request]) => request.roundTrip?.seed)).toEqual([17, 118, 219, 320])
    expect(new Set(provider.mock.calls.map(([request]) => request.roundTrip?.heading)).size).toBe(4)
  })

  it("retries a failed native loop seed before dropping a comparison option", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      if (request.profile === "quick" && request.roundTrip?.seed === 118) {
        throw new Error("round-trip seed could not snap")
      }
      const offset = request.profile === "quick" ? 0.03 : request.profile === "scenic" ? -0.03 : request.profile === "adventure" ? 0.06 : 0
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [{
          ...route(request.profile, offset, `${request.profile}-${request.roundTrip?.seed ?? 0}`),
          durationMinutes: request.roundTrip?.targetMinutes ?? 120
        }]
      }
    })

    const plan = await planMotorcycleTrip({
      profile: "twisty",
      compare: true,
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 45 }
    }, provider)

    expect(provider.mock.calls.filter(([request]) => request.profile === "quick")
      .map(([request]) => request.roundTrip?.seed)).toEqual([118, 341])
    expect(plan.routes.map((candidate) => candidate.profile)).toContain("quick")
  })

  it("retries an overlong round trip and keeps the candidate closest to the timebox", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      const requestedMinutes = request.roundTrip?.targetMinutes ?? 120
      const seed = request.roundTrip?.seed ?? 0
      const durationMinutes = requestedMinutes === 120
        ? 240
        : seed === 219
          ? 118
          : 165
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [{ ...route(request.profile, seed / 10_000, `${request.profile}-${seed}`), durationMinutes }]
      }
    })

    const plan = await planMotorcycleTrip({
      profile: "twisty",
      compare: false,
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 45 }
    }, provider)

    expect(plan.routes[0].durationMinutes).toBe(118)
    expect(provider).toHaveBeenCalledTimes(4)
    expect(provider.mock.calls.slice(1).map(([request]) => request.roundTrip?.targetMinutes))
      .toEqual([60, 60, 60])
  })

  it("uses a final feedback pass when the first calibration still misses", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      const requestedMinutes = request.roundTrip?.targetMinutes ?? 120
      const durationMinutes = requestedMinutes === 120 ? 240 : requestedMinutes === 60 ? 90 : 119
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [{ ...route("scenic", requestedMinutes / 10_000), durationMinutes }]
      }
    })

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      compare: false,
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 45 }
    }, provider)

    expect(plan.routes[0].durationMinutes).toBe(119)
    expect(plan.routes[0].loopTargetMinutes).toBe(120)
    expect(provider).toHaveBeenCalledTimes(5)
    expect(provider.mock.calls[4][0].roundTrip?.targetMinutes).toBe(80)
  })

  it("allows one bounded follow-up when the first feedback pass is still outside tolerance", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      const requestedMinutes = request.roundTrip?.targetMinutes ?? 120
      const durationMinutes = requestedMinutes === 120
        ? 240
        : requestedMinutes === 60
          ? 90
          : requestedMinutes === 80
            ? 100
            : 121
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [{ ...route("adventure", requestedMinutes / 10_000), durationMinutes }]
      }
    })

    const plan = await planMotorcycleTrip({
      profile: "adventure",
      compare: false,
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 45 }
    }, provider)

    expect(plan.routes[0].durationMinutes).toBe(121)
    expect(provider).toHaveBeenCalledTimes(6)
    expect(provider.mock.calls[5][0].roundTrip?.targetMinutes).toBe(96)
  })

  it("warns honestly when fixed loop shaping points miss the timebox", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [{ ...route(request.profile), durationMinutes: 185 }]
    }))

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      compare: false,
      loopTargetMinutes: 120,
      points: [
        { lat: 40.2, lon: -76.9 },
        { lat: 40.3, lon: -76.8 },
        { lat: 40.2, lon: -76.9 }
      ]
    }, provider)

    expect(plan.warnings.join(" ")).toMatch(/185 minutes.*120-minute target/i)
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

  it("drops a comparison that duplicates an already-added comparison", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [route(
        request.profile,
        request.profile === "quick" || request.profile === "scenic"
          ? 0.03
          : request.profile === "adventure"
            ? -0.03
            : 0
      )]
    }))

    const plan = await planMotorcycleTrip({
      profile: "twisty",
      compare: true,
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.2, lon: -76.7 }]
    }, provider)

    expect(plan.routes.map((candidate) => candidate.profile)).not.toContain("scenic")
    expect(plan.warnings.join(" ")).toMatch(/duplicate scenic/i)
  })

  it("drops a comparison that overlaps more than ninety percent even when it is not identical", async () => {
    const selectedGeometry: PlannedRoute["geometry"] = [
      [-76.9, 40.2],
      [-76.7, 40.2]
    ]
    const nearDuplicateGeometry: PlannedRoute["geometry"] = [
      [-76.9, 40.2],
      [-76.71, 40.2],
      [-76.7, 40.21]
    ]
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [{
        ...route(
          request.profile,
          request.profile === "scenic" ? 0.03 : request.profile === "adventure" ? -0.03 : 0
        ),
        geometry: request.profile === "twisty"
          ? selectedGeometry
          : request.profile === "quick"
            ? nearDuplicateGeometry
            : route(request.profile, request.profile === "scenic" ? 0.03 : -0.03).geometry
      }]
    }))

    const plan = await planMotorcycleTrip({
      profile: "twisty",
      compare: true,
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.2, lon: -76.7 }]
    }, provider)

    expect(plan.routes.map((candidate) => candidate.profile)).not.toContain("quick")
    expect(plan.warnings.join(" ")).toMatch(/duplicate quick/i)
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

  it("surfaces partial hybrid-provider warnings without discarding the route", async () => {
    const provider = vi.fn(async (routeRequest: RouteRequest): Promise<RoutingResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [route(routeRequest.profile)],
      warnings: ["Valhalla comparison unavailable."]
    }))

    const plan = await planMotorcycleTrip({
      profile: "twisty",
      compare: false,
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.3, lon: -76.7 }]
    }, provider)

    expect(plan.routes).toHaveLength(1)
    expect(plan.warnings).toContain("Valhalla comparison unavailable.")
  })
})
