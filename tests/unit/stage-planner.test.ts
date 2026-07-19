import { describe, expect, it } from "vitest"
import { buildTripStages, validateTripStages, withOvernightLabel } from "@/lib/trip/stage-planner"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "long-ride",
  name: "Long ridge tour",
  profile: "scenic",
  geometry: [[-77, 40], [-76.5, 40.2], [-76, 40.4], [-75.5, 40.5]],
  waypoints: [{ lat: 40, lon: -77, label: "Start" }, { lat: 40.5, lon: -75.5, label: "Finish" }],
  instructions: [],
  distanceMiles: 420,
  durationMinutes: 720,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 68,
  turnCount: 120,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

describe("multi-day stage planning", () => {
  it("splits a route into editable day stages and inserts conservative fuel and rest cadence", () => {
    const plan = buildTripStages(route, {
      targetDayMinutes: 300,
      fuelRangeMiles: 140,
      fuelReserveMiles: 25,
      breakEveryMinutes: 90,
      daylightMinutes: 210
    })

    expect(plan.stages).toHaveLength(3)
    expect(plan.stages.map((stage) => stage.durationMinutes)).toEqual([240, 240, 240])
    expect(plan.stages.flatMap((stage) => stage.fuelStops).every((stop) => stop.mileFromStart <= 115)).toBe(true)
    expect(plan.stages.flatMap((stage) => stage.breaks)).toHaveLength(6)
    expect(plan.warnings).toContain("Each stage is longer than the selected daylight window.")
  })

  it("keeps a short ride as one stage and rejects unsafe fuel assumptions", () => {
    const short = buildTripStages({ ...route, distanceMiles: 40, durationMinutes: 70 }, {
      targetDayMinutes: 300,
      fuelRangeMiles: 80,
      fuelReserveMiles: 15,
      breakEveryMinutes: 120
    })
    expect(short.stages).toHaveLength(1)
    expect(short.stages[0]?.fuelStops).toEqual([])

    expect(() => buildTripStages(route, {
      targetDayMinutes: 300,
      fuelRangeMiles: 50,
      fuelReserveMiles: 50,
      breakEveryMinutes: 120
    })).toThrow(/fuel reserve/i)
  })

  it("keeps a rider-selected overnight label on an intermediate day only", () => {
    const plan = buildTripStages(route, {
      targetDayMinutes: 300, fuelRangeMiles: 140, fuelReserveMiles: 25, breakEveryMinutes: 90
    })
    const edited = withOvernightLabel(plan, "stage-1", "Pine Creek Lodge")
    const finalStageId = plan.stages.at(-1)!.id
    const finalDay = withOvernightLabel(edited, finalStageId, "Should stay destination")
    expect(finalDay.stages[0]?.overnightLabel).toBe("Pine Creek Lodge")
    expect(finalDay.stages.at(-1)?.overnightLabel).toBeUndefined()
  })
})

describe("validateTripStages", () => {
  function makeRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
    return {
      id: "r",
      name: "Ridge",
      profile: "scenic",
      geometry: [[-77, 40], [-76, 41]],
      waypoints: [{ lat: 40, lon: -77, label: "Start" }, { lat: 41, lon: -76, label: "Finish" }] as Waypoint[],
      instructions: [],
      distanceMiles: 200,
      durationMinutes: 480,
      ascentMeters: null,
      descentMeters: null,
      twistiness: 60,
      turnCount: 10,
      roadMix: {},
      surfaceMix: {},
      routingSource: "live",
      previewOnly: false,
      ...overrides
    }
  }

  function makeStage(overrides: Partial<{
    id: string
    startMile: number
    endMile: number
    distanceMiles: number
    durationMinutes: number
    fuelStops: []
    overnightLabel: string | undefined
  }> = {}) {
    return {
      id: "stage-1",
      label: "Day 1",
      startMile: 0,
      endMile: 100,
      distanceMiles: 100,
      durationMinutes: 200,
      start: { lat: 40, lon: -77, label: "Start" },
      finish: { lat: 41, lon: -76, label: "Finish" },
      fuelStops: [],
      breaks: [],
      ...overrides
    }
  }

  function makeConstraints(overrides: Record<string, number | undefined> = {}) {
    return {
      targetDayMinutes: 300,
      fuelRangeMiles: 140,
      fuelReserveMiles: 25,
      breakEveryMinutes: 90,
      daylightMinutes: undefined as number | undefined,
      ...overrides
    }
  }

  it("returns ok for a well-formed two-stage plan", () => {
    const route = makeRoute({ distanceMiles: 200 })
    const plan = {
      routeId: route.id,
      stages: [
        makeStage({ id: "stage-1", startMile: 0, endMile: 100, distanceMiles: 100, durationMinutes: 240 }),
        makeStage({ id: "stage-2", startMile: 100, endMile: 200, distanceMiles: 100, durationMinutes: 240 })
      ],
      warnings: []
    }
    const result = validateTripStages(plan, route, makeConstraints())
    expect(result.ok).toBe(true)
  })

  it("surfaces missing_stages error when plan.stages is empty", () => {
    const route = makeRoute()
    const plan = { routeId: route.id, stages: [], warnings: [] }
    const result = validateTripStages(plan, route, makeConstraints())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toContain("missing_stages")
    }
  })

  it("surfaces stage_mile_range when a stage has startMile >= endMile", () => {
    const route = makeRoute({ distanceMiles: 100 })
    const plan = {
      routeId: route.id,
      stages: [makeStage({ id: "stage-1", startMile: 80, endMile: 80, distanceMiles: 0, durationMinutes: 100 })],
      warnings: []
    }
    const result = validateTripStages(plan, route, makeConstraints())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toContain("stage_mile_range")
    }
  })

  it("surfaces stage_order when stages are out of ascending order", () => {
    const route = makeRoute({ distanceMiles: 200 })
    const plan = {
      routeId: route.id,
      stages: [
        makeStage({ id: "stage-1", startMile: 100, endMile: 200, distanceMiles: 100, durationMinutes: 240 }),
        makeStage({ id: "stage-2", startMile: 0, endMile: 100, distanceMiles: 100, durationMinutes: 240 })
      ],
      warnings: []
    }
    const result = validateTripStages(plan, route, makeConstraints())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toContain("stage_order")
    }
  })

  it("surfaces terminal_destination when final stage's endMile !== route.distanceMiles", () => {
    const route = makeRoute({ distanceMiles: 250 })
    const plan = {
      routeId: route.id,
      stages: [makeStage({ id: "stage-1", startMile: 0, endMile: 200, distanceMiles: 200, durationMinutes: 240 })],
      warnings: []
    }
    const result = validateTripStages(plan, route, makeConstraints())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toContain("terminal_destination")
    }
  })

  it("surfaces fuel_range_invalid when reserve >= range", () => {
    const route = makeRoute({ distanceMiles: 100 })
    const plan = {
      routeId: route.id,
      stages: [makeStage({ id: "stage-1", startMile: 0, endMile: 100, distanceMiles: 100, durationMinutes: 100 })],
      warnings: []
    }
    const result = validateTripStages(plan, route, makeConstraints({ fuelRangeMiles: 100, fuelReserveMiles: 100 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toContain("fuel_range_invalid")
    }
  })

  it("surfaces fuel_exceeds_stage when a stage exceeds usable range and has no fuel stops", () => {
    const route = makeRoute({ distanceMiles: 200 })
    const plan = {
      routeId: route.id,
      stages: [makeStage({ id: "stage-1", startMile: 0, endMile: 200, distanceMiles: 200, durationMinutes: 240 })],
      warnings: []
    }
    const result = validateTripStages(plan, route, makeConstraints({ fuelRangeMiles: 100, fuelReserveMiles: 10 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toContain("fuel_exceeds_stage")
    }
  })

  it("surfaces daylight_exceeded when stage duration > constraints.daylightMinutes", () => {
    const route = makeRoute({ distanceMiles: 200 })
    const plan = {
      routeId: route.id,
      stages: [
        makeStage({ id: "stage-1", startMile: 0, endMile: 100, distanceMiles: 100, durationMinutes: 300 }),
        makeStage({ id: "stage-2", startMile: 100, endMile: 200, distanceMiles: 100, durationMinutes: 300 })
      ],
      warnings: []
    }
    const result = validateTripStages(plan, route, makeConstraints({ daylightMinutes: 240 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toContain("daylight_exceeded")
    }
  })

  it("warns (not errors) when overnightLabel is set on the final stage", () => {
    const route = makeRoute({ distanceMiles: 100 })
    const plan = {
      routeId: route.id,
      stages: [makeStage({ id: "stage-1", startMile: 0, endMile: 100, distanceMiles: 100, durationMinutes: 100, overnightLabel: "Should not be here" })],
      warnings: []
    }
    const result = validateTripStages(plan, route, makeConstraints())
    expect(result.warnings.length).toBeGreaterThan(0)
    if (result.ok) {
      expect(result.warnings.join(" ")).toMatch(/overnightLabel/i)
    } else {
      expect(result.errors.map((e) => e.code)).not.toContain("overnight_label_outside_intermediate")
      expect(result.warnings.join(" ")).toMatch(/overnightLabel/i)
    }
  })
})
