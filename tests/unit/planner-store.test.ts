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

  it("starts empty until the rider chooses a point or grants location access", () => {
    expect(initialPlannerState).toMatchObject({
      start: null,
      finish: null,
      startQuery: "",
      finishQuery: ""
    })
  })

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

  it("atomically replaces every route point and clears a stale destination for loops", () => {
    usePlannerStore.getState().replaceRoutePoints({
      start: { lat: 40.3, lon: -76.8, label: "Loop start" },
      finish: null,
      via: [{ lat: 40.4, lon: -76.7, label: "Gravel shape" }]
    })

    expect(usePlannerStore.getState()).toMatchObject({
      start: { label: "Loop start" },
      startQuery: "Loop start",
      finish: null,
      finishQuery: "",
      via: [{ label: "Gravel shape" }],
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

  it("keeps the previous comparison visible (dimmed) while a new route is being built", () => {
    usePlannerStore.getState().applyPlan(plan)
    usePlannerStore.getState().beginRouting()

    expect(usePlannerStore.getState()).toMatchObject({
      status: "routing",
      plan: { selectedRouteId: plan.selectedRouteId },
      isRecalculating: true,
      selectedRouteId: plan.selectedRouteId,
      error: null
    })
  })

  it("clears all route inputs, results, and edit history for a new ride", () => {
    usePlannerStore.getState().replaceRoutePoints({
      start: { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
      finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg" },
      via: [{ lat: 40.4, lon: -76.7, label: "Overlook" }]
    })
    usePlannerStore.getState().applyPlan(plan)

    const state = usePlannerStore.getState() as typeof usePlannerStore.getState extends () => infer T
      ? T & { clearRoute(): void }
      : never
    state.clearRoute()

    expect(usePlannerStore.getState()).toMatchObject({
      start: null,
      finish: null,
      via: [],
      startQuery: "",
      finishQuery: "",
      armedPoint: null,
      plan: null,
      selectedRouteId: null,
      status: "idle",
      error: null,
      routePointPast: [],
      routePointFuture: [],
      canUndoRoutePoints: false,
      canRedoRoutePoints: false
    })
  })

  it("adds, drags, and removes shaping waypoints while invalidating stale routes", () => {
    usePlannerStore.getState().applyPlan(plan)
    usePlannerStore.getState().addVia({ lat: 40.4, lon: -76.7, label: "Gravel connector" })
    usePlannerStore.getState().updateVia(0, { lat: 40.41, lon: -76.71, label: "Dragged stop" })

    expect(usePlannerStore.getState()).toMatchObject({
      via: [{ lat: 40.41, lon: -76.71, label: "Dragged stop" }],
      plan: null,
      status: "idle"
    })

    usePlannerStore.getState().removeVia(0)
    expect(usePlannerStore.getState().via).toEqual([])
  })

  it("keeps bounded route-point history and supports undo and redo", () => {
    const gravel = { lat: 40.4, lon: -76.7, label: "Gravel connector" }
    const overlook = { lat: 40.5, lon: -76.6, label: "Overlook" }

    usePlannerStore.getState().addVia(gravel)
    usePlannerStore.getState().addVia(overlook)
    usePlannerStore.getState().moveVia(1, 0)

    expect(usePlannerStore.getState()).toMatchObject({
      via: [overlook, gravel],
      canUndoRoutePoints: true,
      canRedoRoutePoints: false
    })

    usePlannerStore.getState().undoRoutePoints()
    expect(usePlannerStore.getState()).toMatchObject({
      via: [gravel, overlook],
      canUndoRoutePoints: true,
      canRedoRoutePoints: true,
      plan: null,
      status: "idle"
    })

    usePlannerStore.getState().redoRoutePoints()
    expect(usePlannerStore.getState()).toMatchObject({
      via: [overlook, gravel],
      canRedoRoutePoints: false
    })
  })

  it("reverses an A-to-B route atomically, including its shaping-stop order", () => {
    const originalStart = { lat: 40.2732, lon: -76.8867, label: "Start" }
    const originalFinish = { lat: 39.8309, lon: -77.2311, label: "Finish" }
    usePlannerStore.getState().replaceRoutePoints({ start: originalStart, finish: originalFinish, via: [] })
    usePlannerStore.getState().addVia({ lat: 40.4, lon: -76.7, label: "First" })
    usePlannerStore.getState().addVia({ lat: 40.5, lon: -76.6, label: "Second" })

    usePlannerStore.getState().reverseRoutePoints("destination")

    expect(usePlannerStore.getState()).toMatchObject({
      start: originalFinish,
      finish: originalStart,
      via: [{ label: "Second" }, { label: "First" }]
    })

    usePlannerStore.getState().undoRoutePoints()
    expect(usePlannerStore.getState()).toMatchObject({
      start: originalStart,
      finish: originalFinish,
      via: [{ label: "First" }, { label: "Second" }]
    })
  })

  it("seeds a permitted location without creating an undoable rider edit", () => {
    usePlannerStore.getState().seedCurrentLocation({ lat: 40.273246, lon: -76.886735, label: "Current location" })

    expect(usePlannerStore.getState()).toMatchObject({
      start: { label: "Current location" },
      finish: null,
      routePointPast: [],
      canUndoRoutePoints: false
    })
  })

  it("treats a whole sketch replacement as one undoable edit", () => {
    const original = {
      start: usePlannerStore.getState().start,
      finish: usePlannerStore.getState().finish,
      via: usePlannerStore.getState().via
    }
    usePlannerStore.getState().replaceRoutePoints({
      start: original.start,
      finish: original.finish,
      via: [
        { lat: 40.35, lon: -76.75, label: "Sketch stop 1" },
        { lat: 40.1, lon: -77, label: "Sketch stop 2" }
      ]
    })

    usePlannerStore.getState().undoRoutePoints()
    expect(usePlannerStore.getState()).toMatchObject(original)
  })
})
