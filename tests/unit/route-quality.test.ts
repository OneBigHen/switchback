import { describe, expect, it } from "vitest"
import {
  countStateTransitions,
  hardGates,
  maximumTwistiesScore,
  minimumStateTransitions,
  routeQualityReport
} from "@/lib/routing/route-quality"
import { smoothedRouteMetrics } from "@/lib/routing/scoring"
import type { PlannedRoute, TollPolicy } from "@/lib/routing/types"

function route(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "route-1",
    name: "Route",
    profile: "twisty",
    geometry: [
      [-76.8867, 40.2732],
      [-76.7, 40.2],
      [-76.5, 40.25],
      [-76.3055, 40.0379]
    ],
    waypoints: [],
    instructions: [],
    distanceMiles: 40,
    durationMinutes: 120,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 60,
    turnCount: 20,
    roadMix: { secondary: 60, tertiary: 20, residential: 20 },
    surfaceMix: { asphalt: 100 },
    routingSource: "live",
    previewOnly: false,
    ...overrides
  }
}

function input(overrides: {
  route?: PlannedRoute
  targetMinutes?: number
  tollPolicy?: TollPolicy
  stateTransitions?: number
  minimumStateTransitions?: number
  evidenceMiles?: number
} = {}) {
  const { route: r, ...rest } = overrides
  return {
    route: r ?? route(),
    targetMinutes: rest.targetMinutes ?? 120,
    start: [-76.8867, 40.2732] as [number, number],
    finish: [-76.3055, 40.0379] as [number, number],
    tollPolicy: rest.tollPolicy ?? "allow-with-warning",
    stateTransitions: rest.stateTransitions ?? 1,
    minimumStateTransitions: rest.minimumStateTransitions ?? 1,
    evidenceMiles: rest.evidenceMiles ?? 0
  }
}

describe("hard gates", () => {
  it("accepts a route inside the ±10% duration band", () => {
    expect(hardGates(input({ targetMinutes: 120 }))).toEqual({})
  })

  it("rejects a route outside the ±10% duration band", () => {
    const failures = hardGates(input({ route: route({ durationMinutes: 150 }), targetMinutes: 120 }))
    expect(failures.duration).toMatch(/150 minutes is outside/)
  })

  it("rejects more than 15% immediate backtracking", () => {
    const backtracking = route({
      geometry: [
        [-76.8867, 40.2732],
        [-76.6, 40.3],
        [-76.8867, 40.2732],
        [-76.3055, 40.0379]
      ]
    })
    const failures = hardGates(input({ route: backtracking }))
    expect(failures.backtracking).toMatch(/backtracking/)
  })

  it("rejects more than 20% self-overlap", () => {
    const overlapping = route({
      geometry: [
        [-76.8867, 40.2732],
        [-76.7000, 40.3200], [-76.6800, 40.3000], [-76.7000, 40.3200],
        [-76.6600, 40.3000], [-76.6400, 40.2800], [-76.6600, 40.3000],
        [-76.6200, 40.2800], [-76.6000, 40.2600], [-76.6200, 40.2800],
        [-76.5800, 40.2600], [-76.5600, 40.2400], [-76.5800, 40.2600],
        [-76.5400, 40.2400], [-76.5200, 40.2200], [-76.5400, 40.2400],
        [-76.5000, 40.2200], [-76.4800, 40.2000], [-76.5000, 40.2200],
        [-76.4600, 40.2000], [-76.4400, 40.1800], [-76.4600, 40.2000],
        [-76.4200, 40.1800], [-76.4000, 40.1600], [-76.4200, 40.1800],
        [-76.3055, 40.0379]
      ]
    })
    const failures = hardGates(input({ route: overlapping }))
    expect(failures.selfOverlap).toMatch(/self-overlap/)
  })

  it("hard-rejects tolls only under an explicit avoid policy", () => {
    const tolled = route({ tollEvidence: { known: true, tollSharePercent: 40 } })
    expect(hardGates(input({ route: tolled, tollPolicy: "avoid" })).toll).toMatch(/tolled roads/)
    expect(hardGates(input({ route: tolled, tollPolicy: "allow-with-warning" })).toll).toBeUndefined()
  })

  it("penalizes extra state crossings instead of hard-rejecting them", () => {
    expect(hardGates(input({ stateTransitions: 3, minimumStateTransitions: 1 }))).toEqual({})
    const components = maximumTwistiesScore(input({ stateTransitions: 3, minimumStateTransitions: 1 }))
    expect(components.crossingPenalty).toBe(40)
  })
})

describe("maximum-twisties score", () => {
  it("scores a curvy, rural, in-band route well above a noisy straight one", () => {
    const curvy = route({
      durationMinutes: 125,
      geometry: [
        [-76.8867, 40.2732],
        [-76.8, 40.31],
        [-76.72, 40.24],
        [-76.64, 40.31],
        [-76.56, 40.24],
        [-76.48, 40.2],
        [-76.3055, 40.0379]
      ],
      roadMix: { secondary: 70, tertiary: 30 }
    })
    const straight = route({
      durationMinutes: 125,
      geometry: [
        [-76.8867, 40.2732],
        [-76.8, 40.24],
        [-76.7, 40.16],
        [-76.6, 40.08],
        [-76.3055, 40.0379]
      ],
      roadMix: { motorway: 90, residential: 10 }
    })
    const curvyScore = routeQualityReport(input({ route: curvy, targetMinutes: 120 }))
    const straightScore = routeQualityReport(input({ route: straight, targetMinutes: 120 }))
    expect(curvyScore.score).toBeGreaterThan(straightScore.score)
  })

  it("penalizes toll exposure and extra crossings without zeroing the route", () => {
    const tolled = route({ tollEvidence: { known: true, tollSharePercent: 50 } })
    const clean = route()
    const tolledComponents = maximumTwistiesScore(input({ route: tolled, stateTransitions: 2, minimumStateTransitions: 1 }))
    const cleanComponents = maximumTwistiesScore(input({ route: clean, stateTransitions: 1, minimumStateTransitions: 1 }))
    expect(tolledComponents.tollPenalty).toBeGreaterThan(0)
    expect(tolledComponents.crossingPenalty).toBeGreaterThan(0)
    expect(cleanComponents.tollPenalty).toBe(0)
    expect(cleanComponents.crossingPenalty).toBe(0)
  })
})

describe("smoothed geometry metrics", () => {
  it("keeps a straight line at zero twistiness", () => {
    const straight = [
      [-76.9, 40.2],
      [-76.8, 40.2],
      [-76.7, 40.2],
      [-76.6, 40.2]
    ] as [number, number][]
    const metrics = smoothedRouteMetrics(straight)
    expect(metrics.turnCount).toBe(0)
    expect(metrics.curvedDistanceShare).toBe(0)
  })

  it("does not let point noise earn a perfect twistiness score", () => {
    // A nominally straight line with tiny sub-40m jitter must stay near zero.
    const noisy = Array.from({ length: 80 }, (_, index) => [
      -76.9 + index * 0.004,
      40.2 + (index % 2 === 0 ? 0.00005 : -0.00005)
    ]) as [number, number][]
    const metrics = smoothedRouteMetrics(noisy)
    expect(metrics.turnCount).toBeLessThan(3)
    expect(metrics.curvedDistanceShare).toBeLessThan(0.3)
  })

  it("counts real 15°–120° turns on ≥40m segments", () => {
    // Two deliberate ~90° corners on long segments.
    const corners = [
      [-76.9, 40.2],
      [-76.8, 40.2],
      [-76.8, 40.1],
      [-76.7, 40.1]
    ] as [number, number][]
    const metrics = smoothedRouteMetrics(corners)
    expect(metrics.turnCount).toBeGreaterThanOrEqual(2)
    expect(metrics.curvedDistanceShare).toBeGreaterThan(0.5)
  })
})

describe("state boundary counting", () => {
  it("counts one transition for a Harrisburg → Newark route and zero for same-state", () => {
    const crossing = [
      [-76.8867, 40.2732],
      [-76.2, 40.5],
      [-74.17, 40.73]
    ] as [number, number][]
    expect(countStateTransitions(crossing)).toBe(1)
    expect(minimumStateTransitions([-76.8867, 40.2732], [-74.17, 40.73])).toBe(1)

    const sameState = [
      [-76.8867, 40.2732],
      [-76.5, 40.4],
      [-76.9, 40.5]
    ] as [number, number][]
    expect(countStateTransitions(sameState)).toBe(0)
    expect(minimumStateTransitions([-76.8867, 40.2732], [-76.9, 40.5])).toBe(0)
  })
})

describe("route explanations", () => {
  it("derives explanations only from measured fields", () => {
    const report = routeQualityReport(input({ evidenceMiles: 18 }))
    expect(report.passedGates).toBe(true)
    expect(report.explanation.some((line) => /minute target/.test(line))).toBe(true)
    expect(report.explanation.some((line) => /known-good corridor evidence/.test(line))).toBe(true)
  })

  it("surfaces gate failures when the route cannot pass", () => {
    const report = routeQualityReport(input({ route: route({ durationMinutes: 200 }), targetMinutes: 120 }))
    expect(report.passedGates).toBe(false)
    expect(report.explanation.some((line) => /outside/.test(line))).toBe(true)
  })
})
