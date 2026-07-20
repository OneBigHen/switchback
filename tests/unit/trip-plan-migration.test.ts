import { describe, expect, it } from "vitest"
import { buildTripStages } from "@/lib/trip/stage-planner"
import { createTripPlan } from "@/lib/trip/trip-plan"
import { migrateTripPlanStageActions, migrateTripPlanToCurrent } from "@/lib/trip/trip-plan-migration"
import type { PlannedRoute } from "@/lib/routing/types"
import type { TripPlan } from "@/lib/trip/trip-plan"

const route: PlannedRoute = {
  id: "migration-route",
  name: "Migration route",
  profile: "scenic",
  geometry: [[-77, 40], [-76, 41]],
  waypoints: [{ lat: 40, lon: -77, label: "Start" }, { lat: 41, lon: -76, label: "Finish" }],
  instructions: [],
  distanceMiles: 120,
  durationMinutes: 240,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 60,
  turnCount: 12,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

const constraints = { targetDayMinutes: 140, fuelRangeMiles: 150, fuelReserveMiles: 25, breakEveryMinutes: 80 }

function makePlan(): TripPlan {
  return createTripPlan(route, buildTripStages(route, constraints), constraints, "2026-07-18T00:00:00.000Z")
}

describe("trip plan migration", () => {
  it("returns v2 trip plans unchanged", () => {
    const plan = makePlan()
    expect(migrateTripPlanToCurrent(plan)).toBe(plan)
  })

  it("throws on unsupported future trip plan versions", () => {
    const plan = { ...makePlan(), version: 3 }
    expect(() => migrateTripPlanToCurrent(plan)).toThrow(/unsupported trip plan version 3/i)
  })

  it("returns v2 trip plans unchanged when migrating stage actions", () => {
    const plan = makePlan()
    expect(migrateTripPlanStageActions(plan)).toBe(plan)
  })
})
