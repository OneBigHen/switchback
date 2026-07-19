import "fake-indexeddb/auto"
import Dexie from "dexie"
import { describe, expect, it } from "vitest"
import { createTripPlan, TRIP_PLAN_VERSION, validateTripPlan } from "@/lib/trip/trip-plan"
import { TripPlanLibrary } from "@/lib/storage/trip-plan-library"
import { buildTripStages } from "@/lib/trip/stage-planner"
import type { PlannedRoute } from "@/lib/routing/types"

const route = { id: "r", name: "Ridge", profile: "scenic", geometry: [[-77, 40], [-76, 41]], waypoints: [], instructions: [], distanceMiles: 100, durationMinutes: 240, ascentMeters: null, descentMeters: null, twistiness: 60, turnCount: 10, roadMix: {}, surfaceMix: {}, routingSource: "live", previewOnly: false } satisfies PlannedRoute

describe("TripPlan", () => {
  it("persists a versioned immutable copy of calculated stages", () => {
    const constraints = { targetDayMinutes: 120, fuelRangeMiles: 120, fuelReserveMiles: 20, breakEveryMinutes: 60 }
    const stages = buildTripStages(route, constraints)
    const trip = createTripPlan(route, stages, constraints, "2026-07-18T00:00:00.000Z")
    expect(trip).toMatchObject({ version: 2, routeId: route.id, name: route.name, createdAt: "2026-07-18T00:00:00.000Z" })
    expect(trip.stages).toHaveLength(2)
    expect(trip.constraints).toEqual(constraints)
  })

  it("stores and restores a local-first trip plan", async () => {
    const library = new TripPlanLibrary(`switchback-trip-${crypto.randomUUID()}`)
    try {
      const constraints = { targetDayMinutes: 120, fuelRangeMiles: 120, fuelReserveMiles: 20, breakEveryMinutes: 60 }
      const stages = buildTripStages(route, constraints)
      const saved = await library.save(createTripPlan(route, stages, constraints))
      expect(await library.get(saved.id)).toMatchObject({ id: saved.id, routeId: route.id, version: 2 })
      expect(await library.list()).toHaveLength(1)
      await library.remove(saved.id)
      expect(await library.list()).toEqual([])
    } finally {
      await library.destroy()
    }
  })

  it("migrates version-one browser records without dropping their itinerary", async () => {
    const name = `switchback-trip-migration-${crypto.randomUUID()}`
    const legacyDatabase = new Dexie(name)
    legacyDatabase.version(1).stores({ trips: "&id, routeId, updatedAt, createdAt" })
    await legacyDatabase.open()
    await legacyDatabase.table("trips").put({
      version: 1,
      id: "legacy-trip",
      routeId: route.id,
      name: route.name,
      route,
      stages: [],
      warnings: [],
      createdAt: "2026-07-17T00:00:00.000Z",
      updatedAt: "2026-07-17T00:00:00.000Z"
    })
    legacyDatabase.close()

    const library = new TripPlanLibrary(name)
    try {
      await expect(library.get("legacy-trip")).resolves.toMatchObject({
        version: 2,
        routeId: route.id,
        constraints: { targetDayMinutes: 300, fuelRangeMiles: 140, fuelReserveMiles: 25, breakEveryMinutes: 90, daylightMinutes: 270 }
      })
    } finally {
      await library.destroy()
    }
  })
})

describe("TripPlan validation", () => {
  const constraints = { targetDayMinutes: 120, fuelRangeMiles: 120, fuelReserveMiles: 20, breakEveryMinutes: 60 }

  function buildValidTrip(overrides: Partial<PlannedRoute> = {}): { trip: ReturnType<typeof createTripPlan>; route: PlannedRoute } {
    const validRoute = { ...route, ...overrides }
    const stages = buildTripStages(validRoute, constraints)
    const trip = createTripPlan(validRoute, stages, constraints, "2026-07-18T00:00:00.000Z")
    return { trip, route: validRoute }
  }

  it("validateTripPlan returns ok for a constructed plan and its route", () => {
    const { trip, route: planRoute } = buildValidTrip()
    const result = validateTripPlan(trip, planRoute)
    expect(result.ok).toBe(true)
  })

  it("validateTripPlan surfaces version_mismatch when version differs", () => {
    const { trip, route: planRoute } = buildValidTrip()
    const wrong = { ...trip, version: (TRIP_PLAN_VERSION + 1) as typeof TRIP_PLAN_VERSION }
    const result = validateTripPlan(wrong, planRoute)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toContain("version_mismatch")
    }
  })

  it("validateTripPlan surfaces route_mismatch when plan.routeId !== route.id", () => {
    const { trip, route: planRoute } = buildValidTrip()
    const other = { ...planRoute, id: "different-route-id" }
    const result = validateTripPlan(trip, other)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toContain("route_mismatch")
    }
  })

  it("validateTripPlan surfaces route_invalid when route.previewOnly is true", () => {
    const { trip } = buildValidTrip()
    const previewOnlyTrip = { ...trip, route: { ...trip.route, previewOnly: true } }
    const previewOnlyRoute: PlannedRoute = { ...trip.route, previewOnly: true }
    const result = validateTripPlan(previewOnlyTrip, previewOnlyRoute)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((e) => e.code)).toContain("route_invalid")
    }
  })

  it("validateTripPlan surfaces stages_invalid with nestedErrors when stages are empty", () => {
    const { trip, route: planRoute } = buildValidTrip()
    const emptyStages = { ...trip, stages: [] }
    const result = validateTripPlan(emptyStages, planRoute)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const stagesError = result.errors.find((e) => e.code === "stages_invalid")
      expect(stagesError).toBeDefined()
      if (stagesError && "nestedErrors" in stagesError) {
        expect(stagesError.nestedErrors.map((e) => e.code)).toContain("missing_stages")
      }
    }
  })
})
