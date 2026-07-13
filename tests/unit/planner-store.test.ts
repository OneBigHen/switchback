import { beforeEach, describe, expect, it } from "vitest"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"
import type { TripPlan } from "@/lib/routing/planner"
import type { PlannedRoute } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "twisty-1",
  name: "Twisty route",
  profile: "twisty",
  geometry: [[-76.8, 40.2], [-76.7, 40.3]],
  waypoints: [],
  instructions: [],
  distanceMiles: 21,
  durationMinutes: 39,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 74,
  turnCount: 27,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

const plan: TripPlan = {
  selectedRouteId: route.id,
  routes: [route],
  warnings: []
}

describe("planner store", () => {
  beforeEach(() => usePlannerStore.setState(initialPlannerState))

  it("arms a map endpoint and records an exact map pick", () => {
    usePlannerStore.getState().armPoint("finish")
    usePlannerStore.getState().setPoint("finish", {
      lat: 40.3643,
      lon: -74.9513,
      label: "Dropped pin"
    })

    expect(usePlannerStore.getState()).toMatchObject({
      armedPoint: null,
      finish: { lat: 40.3643, lon: -74.9513, label: "Dropped pin" }
    })
  })

  it("applies the provider-selected route and switches surfaces explicitly", () => {
    usePlannerStore.getState().applyPlan(plan)
    usePlannerStore.getState().setSurface("ride")

    expect(usePlannerStore.getState()).toMatchObject({
      status: "ready",
      selectedRouteId: "twisty-1",
      surface: "ride"
    })
  })

  it("clears stale coordinates and results as soon as waypoint text is edited", () => {
    usePlannerStore.getState().applyPlan(plan)
    usePlannerStore.getState().setPointQuery("finish", "A different destination")

    expect(usePlannerStore.getState()).toMatchObject({
      finish: null,
      finishQuery: "A different destination",
      plan: null,
      selectedRouteId: null,
      status: "idle"
    })
  })

  it("invalidates old route results when the rider changes profile", () => {
    usePlannerStore.getState().applyPlan(plan)
    usePlannerStore.getState().setProfile("adventure")

    expect(usePlannerStore.getState()).toMatchObject({
      profile: "adventure",
      plan: null,
      selectedRouteId: null,
      status: "idle"
    })
  })

  it("clears the previous comparison while a new route is being built", () => {
    usePlannerStore.getState().applyPlan(plan)
    usePlannerStore.getState().beginRouting()

    expect(usePlannerStore.getState()).toMatchObject({
      status: "routing",
      plan: null,
      selectedRouteId: null,
      error: null
    })
  })
})
