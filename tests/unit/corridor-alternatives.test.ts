import { describe, expect, it, vi } from "vitest"
import { planMotorcycleTrip, type RoutingResult } from "@/lib/routing/planner"
import { scorePlannedRoute } from "@/lib/recommendation/route-candidate"
import {
  corridorEnvelopeMeters,
  sampleSketchCorridor,
  sketchCorridorContext
} from "@/lib/routing/sketch-corridor"
import type {
  Coordinate,
  PlannedRoute,
  RouteProfileId,
  RouteRequest
} from "@/lib/routing/types"

/** A due-east stroke from (-77, 40.2) to (-76.6, 40.2). */
function stroke(latitude = 40.2, count = 40): Coordinate[] {
  return Array.from({ length: count }, (_, index): Coordinate => [
    -77 + (0.4 * index) / (count - 1),
    latitude
  ])
}

const corridor = sampleSketchCorridor(stroke())

function candidate(
  profile: RouteProfileId,
  id: string,
  geometry: Coordinate[]
): PlannedRoute {
  return {
    id,
    name: `${profile} route`,
    profile,
    geometry,
    waypoints: [],
    instructions: [],
    distanceMiles: 22,
    durationMinutes: 40,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 55,
    turnCount: 14,
    roadMix: { secondary: 100 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    previewOnly: false
  }
}

/**
 * A provider that answers each variant with geometry offset by how many
 * shaping anchors it was handed: the more anchors, the closer to the stroke.
 * That is the real behaviour the corridor path depends on — fewer anchors let
 * the engine wander — expressed deterministically.
 */
function corridorProvider() {
  return vi.fn(async (request: RouteRequest): Promise<RoutingResult> => {
    const anchors = Math.max(0, request.points.length - 2)
    const offset = (3 - anchors) * 0.008
    return {
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [candidate(request.profile, `${request.profile}-${anchors}`, stroke(40.2 + offset))]
    }
  })
}

describe("free-draw corridor alternatives", () => {
  it("names the stroke-driven primary as the traced option and measures its fit", async () => {
    const provider = vi.fn(async (): Promise<RoutingResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: [candidate("scenic", "traced-primary", stroke())]
    }))

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      points: [
        { lat: 40.2, lon: -77 },
        { lat: 40.2, lon: -76.8 },
        { lat: 40.2, lon: -76.6 }
      ],
      sketchCorridor: corridor
    }, provider)

    expect(plan.routes).toHaveLength(1)
    expect(plan.routes[0]!.corridorOption).toBe("traced")
    expect(plan.routes[0]!.name).toBe("Traced")
    expect(plan.routes[0]!.corridorAdherence?.score).toBe(100)
  })

  it("returns distinct corridor options at different adherence levels", async () => {
    const provider = corridorProvider()

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      candidateSet: "alternatives",
      primaryRoute: { id: "traced-primary", geometry: stroke() },
      points: [
        { lat: 40.2, lon: -77 },
        { lat: 40.2, lon: -76.6 }
      ],
      sketchCorridor: corridor
    }, provider)

    expect(plan.selectedRouteId).toBe("traced-primary")
    expect(plan.routes.length).toBeGreaterThanOrEqual(2)
    // One option per role — never two of the same kind.
    expect([...plan.routes.map((route) => route.corridorOption)].sort())
      .toEqual(["better-roads", "leaner"])
    expect([...plan.routes.map((route) => route.name)].sort())
      .toEqual(["Better roads nearby", "Leaner"])
    // Every option carries a measured fit, and each is a different line.
    for (const route of plan.routes) {
      expect(route.corridorAdherence).toBeDefined()
      expect(route.overlapPercent).toBeLessThan(100)
    }
    // The variant that kept more of the drawn line reads it more closely.
    // (The 3-anchor variant duplicates the traced primary here and is dropped,
    // which is exactly the duplicate rejection the corridor path relies on.)
    const better = plan.routes.find((route) => route.corridorOption === "better-roads")!
    const leaner = plan.routes.find((route) => route.corridorOption === "leaner")!
    expect(leaner.corridorAdherence!.score).toBeLessThan(better.corridorAdherence!.score)
  })

  it("relaxes the stroke instead of re-sending the sketch's hard shaping vias", async () => {
    const provider = corridorProvider()

    await planMotorcycleTrip({
      profile: "scenic",
      candidateSet: "alternatives",
      primaryRoute: { id: "traced-primary", geometry: stroke() },
      // Six hard vias: exactly the shape that used to collapse every
      // comparison profile onto one line and return zero alternatives.
      points: [
        { lat: 40.2, lon: -77 },
        { lat: 40.2, lon: -76.94 },
        { lat: 40.2, lon: -76.88 },
        { lat: 40.2, lon: -76.82 },
        { lat: 40.2, lon: -76.76 },
        { lat: 40.2, lon: -76.7 },
        { lat: 40.2, lon: -76.64 },
        { lat: 40.2, lon: -76.6 }
      ],
      sketchCorridor: corridor
    }, provider)

    const anchorCounts = provider.mock.calls.map(([request]) => request.points.length - 2)
    expect(anchorCounts.length).toBeGreaterThanOrEqual(2)
    // No variant re-sends the six pinned vias, and the endpoints are kept.
    expect(Math.max(...anchorCounts)).toBeLessThanOrEqual(3)
    for (const [request] of provider.mock.calls) {
      expect(request.points[0]).toMatchObject({ lat: 40.2, lon: -77 })
      expect(request.points.at(-1)).toMatchObject({ lat: 40.2, lon: -76.6 })
      expect(request.targetMinutes).toBeUndefined()
    }
  })

  it("offers options for a sketched loop instead of refusing alternatives", async () => {
    const provider = corridorProvider()

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      candidateSet: "alternatives",
      primaryRoute: { id: "traced-loop", geometry: stroke() },
      loopTargetMinutes: 120,
      points: [
        { lat: 40.2, lon: -77 },
        { lat: 40.2, lon: -76.8 },
        { lat: 40.2, lon: -77 }
      ],
      sketchCorridor: corridor
    }, provider)

    expect(plan.warnings).not.toContain(
      "Alternatives are only available for point-to-point destination rides."
    )
    expect(plan.routes.length).toBeGreaterThanOrEqual(1)
    // Every loop variant still returns to its start and keeps at least one
    // interior shaping point, so it stays a loop.
    for (const [request] of provider.mock.calls) {
      expect(request.points.length).toBeGreaterThanOrEqual(3)
      expect(request.points[0]).toEqual(request.points.at(-1))
    }
  })

  it("still refuses profile-comparison alternatives for a loop with no stroke", async () => {
    const provider = vi.fn(async (): Promise<RoutingResult> => ({
      engine: "graphhopper",
      engineVersion: "11.0",
      routes: []
    }))

    const plan = await planMotorcycleTrip({
      profile: "scenic",
      candidateSet: "alternatives",
      primaryRoute: { id: "loop-primary", geometry: stroke() },
      loopTargetMinutes: 120,
      points: [
        { lat: 40.2, lon: -77 },
        { lat: 40.2, lon: -76.8 },
        { lat: 40.2, lon: -77 }
      ]
    }, provider)

    expect(plan.routes).toEqual([])
    expect(plan.warnings).toContain(
      "Alternatives are only available for point-to-point destination rides."
    )
    expect(provider).not.toHaveBeenCalled()
  })
})

describe("corridor adherence as a scored axis", () => {
  const context = sketchCorridorContext(corridor)!

  it("penalizes a route that leaves the drawn corridor", () => {
    const onLine = candidate("scenic", "on-line", stroke())
    // ~11 km off the stroke: outside the envelope for its whole length.
    const offLine = candidate("scenic", "off-line", stroke(40.3))

    const scoredOn = scorePlannedRoute(onLine, { corridor: context })
    const scoredOff = scorePlannedRoute(offLine, { corridor: context })

    expect(scoredOn.corridorAdherence).toBe(100)
    expect(scoredOff.corridorAdherence).toBe(0)
    expect(scoredOn.utility!.corridorAdherencePenalty).toBe(0)
    expect(scoredOff.utility!.corridorAdherencePenalty).toBeGreaterThan(0)
    expect(scoredOn.total).toBeGreaterThan(scoredOff.total)
    // The axis is a cost, never a filter: an off-corridor route is still
    // eligible, it just scores worse.
    expect(scoredOff.accepted).toBe(true)
  })

  it("leaves scores untouched when the rider drew nothing", () => {
    const route = candidate("scenic", "no-corridor", stroke())
    const scored = scorePlannedRoute(route)

    expect(scored.corridorAdherence).toBeUndefined()
    expect(scored.corridorFit).toBeUndefined()
    expect(scored.utility!.corridorAdherencePenalty).toBe(0)
  })

  it("keeps the envelope proportional to the stroke the rider drew", () => {
    expect(context.envelopeMeters).toBe(corridorEnvelopeMeters(corridor))
  })
})
