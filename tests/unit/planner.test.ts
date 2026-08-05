import { describe, expect, it, vi } from "vitest"
import { planMotorcycleTrip, type RoutingResult } from "@/lib/routing/planner"
import type { GraphHopperResult } from "@/lib/routing/graphhopper"
import type { PlannedRoute, RouteProfileId, RouteRequest } from "@/lib/routing/types"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import { createManualRoadLock } from "@/lib/roads/road-locks"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"

const accessibleSnapshot: RoadAccessSnapshot = {
  highwayClass: "secondary",
  motorcycleAccess: "yes",
  generalAccess: "yes",
  surface: "asphalt",
  smoothness: "good",
  tracktype: "unknown",
  maxweightTonnes: null,
  seasonalUndated: false,
  activeConditions: [],
  routable: true
}
const roadLock = createManualRoadLock({
  mode: "prefer",
  edgeIds: ["e1"],
  geometry: [[-76.8, 40.2], [-76.78, 40.21]],
  orderedAnchors: [[-76.8, 40.2], [-76.78, 40.21]],
  accessSnapshot: accessibleSnapshot,
  sourceRegionId: "pennsylvania",
  sourceGraphVersion: "gh-11-1"
})

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
      segmentProfiles: ["twisty", "adventure"],
      bikeProfile: { ...MOTORCYCLE_PROFILES.find((p) => p.category === "street")! },
      avoidHighways: true,
      tollPolicy: "avoid",
      avoidAreas: [{ id: "a1", name: "Construction", polygon: [[-76.85, 40.2], [-76.83, 40.2], [-76.83, 40.22], [-76.85, 40.22]] }],
      roadLocks: [roadLock]
    } as RouteRequest, provider)

    expect(provider).toHaveBeenCalledTimes(2)
    expect(provider.mock.calls.map(([request]) => request.profile)).toEqual(["twisty", "adventure"])
    // SB-003: every leg inherits the full normalized constraint set — bike
    // profile, highway/toll policy, avoid areas, and road requirements.
    for (const [request] of provider.mock.calls) {
      expect(request.bikeProfile?.category).toBe("street")
      expect(request.avoidHighways).toBe(true)
      expect(request.tollPolicy).toBe("avoid")
      expect(request.avoidAreas).toHaveLength(1)
      expect(request.roadLocks).toEqual([roadLock])
    }
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

  it("returns only the selected primary route without comparison or enrichment work", async () => {
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

    // Phase 2: the primary call is one profile, one route. Comparison
    // profiles belong to the separate alternatives call.
    expect(provider).toHaveBeenCalledTimes(1)
    expect(provider.mock.calls[0][0].profile).toBe("scenic")
    expect(plan.routes).toHaveLength(1)
    expect(plan.routes[0].profile).toBe("scenic")
    expect(plan.selectedRouteId).toBe("scenic-route")
  })

  it("builds alternatives separately: sequential profiles, at most two meaningfully different routes", async () => {
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
      candidateSet: "alternatives",
      primaryRoute: { id: "scenic-primary", geometry: route("scenic").geometry },
      points: [
        { lat: 40.2, lon: -76.9 },
        { lat: 40.2, lon: -76.7 }
      ]
    }, provider)

    expect(provider.mock.calls.map(([callRequest]) => callRequest.profile)).toEqual([
      "quick",
      "twisty"
    ])
    expect(plan.selectedRouteId).toBe("scenic-primary")
    expect(plan.routes).toHaveLength(2)
    expect(plan.routes.find((candidate) => candidate.profile === "quick")?.id).toBe("quick-distinct")
    expect(plan.routes[0].overlapPercent).toBeLessThan(100)
  })

  it("caps progressive alternatives at two and skips the remaining profiles", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [route(
        request.profile,
        request.profile === "quick" ? 0.02 : request.profile === "twisty" ? -0.02 : 0.04,
        `${request.profile}-distinct`
      )]
    }))

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      compare: true,
      candidateSet: "alternatives",
      primaryRoute: { id: "scenic-primary", geometry: route("scenic").geometry },
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.2, lon: -76.7 }]
    }, provider)

    // quick and twisty are accepted; adventure is not attempted once the cap is full.
    expect(plan.routes).toHaveLength(2)
    expect(provider.mock.calls.map(([callRequest]) => callRequest.profile)).toEqual(["quick", "twisty"])
  })

  it("prefers official-road evidence among already-distinct Adventure alternatives", async () => {
    const official = {
      ...route("adventure", 0.11, "adventure-official"),
      geometry: [
        [-76.9, 40.1],
        [-76.8, 40.1],
        [-76.7, 40.13]
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
      routes: request.profile === "quick"
        ? [{ ...route("quick"), geometry: route("scenic").geometry }]
        : request.profile === "adventure"
          ? [official, route("adventure", 0.13, "adventure-farthest")]
          : [route(request.profile, request.profile === "twisty" ? 0.02 : 0)]
    }))

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      compare: true,
      candidateSet: "alternatives",
      primaryRoute: { id: "scenic-primary", geometry: route("scenic").geometry },
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.2, lon: -76.7 }]
    }, provider)

    // quick duplicates the primary and is dropped; twisty and adventure fill
    // the two alternative slots, and adventure's official-evidence candidate
    // beats the farthest lookalike.
    expect(plan.routes.map((candidate) => candidate.profile)).toEqual(["twisty", "adventure"])
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

  it("does not let optional PA unpaved-road evidence delay the primary Adventure winner", async () => {
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

    // Primary never waits for PASDA; selection uses surface evidence alone.
    expect(enricher).not.toHaveBeenCalled()
    expect(plan.selectedRouteId).toBe("osm-gravel")
  })

  it("samples several time-matched Adventure loops on the primary without enrichment", async () => {
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
      routes,
      warnings: []
    }))

    const plan = await planMotorcycleTrip({
      profile: "adventure",
      compare: false,
      points: [{ lat: 40.2732, lon: -76.8867 }],
      roundTrip: { targetMinutes: 120, seed: 17, heading: 45 }
    }, provider, enricher)

    expect(provider).toHaveBeenCalledTimes(4)
    expect(enricher).not.toHaveBeenCalled()
    expect(plan.selectedRouteId).toBe("adventure-17")
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

  it("samples native loop seeds on the primary profile without cross-profile variation", async () => {
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

    // In-tolerance native loops return from the first seed without
    // cross-profile variation or comparison work.
    expect(provider.mock.calls.map(([callRequest]) => callRequest.roundTrip?.seed)).toEqual([17])
    expect(provider.mock.calls.every(([callRequest]) => callRequest.profile === "twisty")).toBe(true)
  })

  it("retries a failed native loop seed without dropping the primary route", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      if (request.roundTrip?.seed === 118) {
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

    // The failed seed 118 attempt settles as rejected; surviving seeds keep
    // the primary route usable.
    expect(plan.routes.length).toBeGreaterThanOrEqual(1)
    expect(plan.routes[0].profile).toBe("twisty")
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

  it("walks the round-trip distance down instead of failing in sparse areas", async () => {
    // Sparse road areas cannot support the full requested loop length: the
    // provider rejects any attempt at 120 or 90 minutes (GraphHopper's
    // "Could not find a valid point after 3 tries") but succeeds at 60.
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => {
      const minutes = request.roundTrip?.targetMinutes ?? 120
      if (minutes >= 90) {
        throw new Error("Could not find a valid point after 3 tries")
      }
      return {
        engine: "graphhopper",
        engineVersion: "11.0",
        routes: [{
          ...route("scenic", 0.01, `scenic-${minutes}`),
          durationMinutes: minutes
        }]
      }
    })

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      compare: false,
      points: [{ lat: 39.7, lon: -78.0 }],
      roundTrip: { targetMinutes: 120, seed: 17 }
    }, provider)

    // A shorter loop is returned instead of a hard failure, and the caller
    // explains the shortened duration (the calibration walks it as high as
    // the area supports — 86 in this fixture).
    expect(plan.routes.length).toBeGreaterThanOrEqual(1)
    expect(plan.routes[0].durationMinutes).toBeGreaterThanOrEqual(60)
    expect(plan.warnings.join(" ")).toMatch(/loop is \d+ minutes/i)
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

  it("drops an alternative whose geometry duplicates the primary route", async () => {
    const primaryGeometry = route("twisty").geometry
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [{
        ...route(request.profile, request.profile === "quick" ? 0 : 0.02, `${request.profile}-candidate`),
        geometry: request.profile === "quick"
          ? primaryGeometry
          : route(request.profile, request.profile === "scenic" ? 0.02 : -0.02).geometry
      }]
    }))

    const plan = await planMotorcycleTrip(
      {
        profile: "twisty",
        compare: true,
        candidateSet: "alternatives",
        primaryRoute: { id: "twisty-primary", geometry: primaryGeometry },
        points: [
          { lat: 40.2, lon: -76.9 },
          { lat: 40.2, lon: -76.7 }
        ]
      },
      provider
    )

    expect(plan.routes.map((candidate) => candidate.profile)).not.toContain("quick")
    expect(plan.warnings.join(" ")).toMatch(/duplicate quick/i)
  })

  it("drops an alternative that duplicates an already-accepted alternative", async () => {
    const provider = vi.fn(async (request: RouteRequest): Promise<GraphHopperResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [{
        ...route(request.profile, request.profile === "quick" || request.profile === "scenic" ? 0.02 : -0.02),
        geometry: request.profile === "quick" || request.profile === "scenic"
          ? route(request.profile, 0.02).geometry
          : route(request.profile, -0.02).geometry
      }]
    }))

    const plan = await planMotorcycleTrip({
      profile: "twisty",
      compare: true,
      candidateSet: "alternatives",
      primaryRoute: { id: "twisty-primary", geometry: route("twisty").geometry },
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.2, lon: -76.7 }]
    }, provider)

    // quick is accepted first; scenic duplicates it and is dropped; adventure is accepted second.
    expect(plan.routes.map((candidate) => candidate.profile)).not.toContain("scenic")
    expect(plan.routes.map((candidate) => candidate.profile)).toContain("quick")
    expect(plan.routes.map((candidate) => candidate.profile)).toContain("adventure")
    expect(plan.warnings.join(" ")).toMatch(/duplicate scenic/i)
  })

  it("drops an alternative that overlaps the primary more than eighty-five percent", async () => {
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
        geometry: request.profile === "quick"
          ? nearDuplicateGeometry
          : route(request.profile, request.profile === "scenic" ? 0.03 : -0.03).geometry
      }]
    }))

    const plan = await planMotorcycleTrip({
      profile: "twisty",
      compare: true,
      candidateSet: "alternatives",
      primaryRoute: { id: "twisty-primary", geometry: selectedGeometry },
      points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.2, lon: -76.7 }]
    }, provider)

    expect(plan.routes.map((candidate) => candidate.profile)).not.toContain("quick")
    expect(plan.warnings.join(" ")).toMatch(/duplicate quick/i)
  })

  it("keeps the primary route usable when an alternative profile fails", async () => {
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
        candidateSet: "alternatives",
        primaryRoute: { id: "scenic-primary", geometry: route("scenic").geometry },
        points: [
          { lat: 40.2, lon: -76.9 },
          { lat: 40.2, lon: -76.7 }
        ]
      },
      provider
    )

    expect(plan.routes.length).toBeGreaterThanOrEqual(1)
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
