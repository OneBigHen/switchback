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

  it("never lets automatic selection replace an explicit user selection (SB-005)", () => {
    usePlannerStore.getState().applyPlan(plan)
    expect(usePlannerStore.getState().selectionSource).toBe("automatic")

    // The rider taps a route: source flips to user.
    usePlannerStore.getState().selectRoute("twisty-1")
    expect(usePlannerStore.getState().selectionSource).toBe("user")

    // Late alternatives / learned re-ranking must not overwrite it.
    usePlannerStore.getState().applyAutomaticRouteSelection("other-route")
    expect(usePlannerStore.getState()).toMatchObject({
      selectedRouteId: "twisty-1",
      selectionSource: "user"
    })
  })

  it("preserves an explicit route selection when alternatives merge", () => {
    const secondary = { ...route, id: "quick-1", name: "Quick route", profile: "quick" as const }
    const alternative = { ...route, id: "scenic-2", name: "Scenic alternative", profile: "scenic" as const }
    usePlannerStore.getState().applyPlan({
      selectedRouteId: route.id,
      routes: [route, secondary],
      warnings: []
    })
    usePlannerStore.getState().selectRoute(secondary.id)

    usePlannerStore.getState().mergeAlternatives({
      selectedRouteId: route.id,
      routes: [alternative],
      warnings: []
    })

    expect(usePlannerStore.getState()).toMatchObject({
      selectedRouteId: secondary.id,
      selectionSource: "user"
    })
    expect(usePlannerStore.getState().plan?.routes.map(({ id }) => id)).toEqual([
      route.id,
      secondary.id,
      alternative.id
    ])
  })

  it("treats a new plan's provider-chosen route as automatic again", () => {
    usePlannerStore.getState().selectRoute("twisty-1")
    const nextPlan = {
      selectedRouteId: "scenic-1",
      routes: [{ ...route, id: "scenic-1", profile: "scenic" as const }],
      warnings: []
    }
    usePlannerStore.getState().applyPlan(nextPlan)
    expect(usePlannerStore.getState()).toMatchObject({
      selectedRouteId: "scenic-1",
      selectionSource: "automatic"
    })
  })

  it("keeps the committed point and result while waypoint text is only being typed", () => {
    const finish = { lat: 40.3643, lon: -76.9513, label: "Original destination" }
    usePlannerStore.getState().setPoint("finish", finish)
    usePlannerStore.getState().applyPlan(plan)
    const before = usePlannerStore.getState()
    const beforeIdentity = before.getIntentIdentity()
    const beforePlan = before.plan

    usePlannerStore.getState().setPointQuery("finish", "A different destination")

    expect(usePlannerStore.getState()).toMatchObject({
      finish,
      finishQuery: "A different destination",
      selectedRouteId: route.id
    })
    expect(usePlannerStore.getState().plan).toBe(beforePlan)
    expect(usePlannerStore.getState().getIntentIdentity()).toBe(beforeIdentity)
    expect(usePlannerStore.getState().rideHistory.past).toHaveLength(before.rideHistory.past.length)
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

  it("preserves the committed route while a profile edit creates a new intent revision", () => {
    usePlannerStore.getState().applyPlan(plan)
    const before = usePlannerStore.getState()
    const beforeIdentity = before.getIntentIdentity()
    usePlannerStore.getState().setProfile("adventure")

    expect(usePlannerStore.getState()).toMatchObject({
      profile: "adventure",
      selectedRouteId: route.id
    })
    expect(usePlannerStore.getState().plan).toBe(before.plan)
    expect(usePlannerStore.getState().getIntentIdentity()).not.toBe(beforeIdentity)
    expect(usePlannerStore.getState().rideHistory.past).toHaveLength(before.rideHistory.past.length + 1)
    expect(usePlannerStore.getState().rideHistory.past.at(-1)?.intent.profile).toBe(before.profile)
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

  it("clears the whole intent while keeping the clear undoable", () => {
    usePlannerStore.getState().replaceRoutePoints({
      start: { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
      finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg" },
      via: [{ lat: 40.4, lon: -76.7, label: "Overlook" }]
    })
    usePlannerStore.getState().setProfile("adventure")
    usePlannerStore.getState().applyPlan(plan)
    const before = usePlannerStore.getState()
    const beforeIdentity = before.getIntentIdentity()
    const beforeIntent = {
      start: before.start,
      finish: before.finish,
      via: before.via,
      profile: before.profile
    }

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
      canUndoRideChange: true,
      canRedoRideChange: false
    })
    expect(usePlannerStore.getState().getIntentIdentity()).not.toBe(beforeIdentity)
    expect(usePlannerStore.getState().rideHistory.past.at(-1)?.intent).toMatchObject({
      start: before.start,
      finish: before.finish,
      via: before.via,
      profile: before.profile
    })

    state.undoRideChange()
    expect(usePlannerStore.getState()).toMatchObject(beforeIntent)
    expect(usePlannerStore.getState().plan).toBeNull()
    expect(usePlannerStore.getState().canRedoRideChange).toBe(true)
    expect(usePlannerStore.getState().getIntentIdentity()).not.toBe(beforeIdentity)
  })

  it("adds, drags, and removes shaping waypoints while preserving the committed route", () => {
    usePlannerStore.getState().applyPlan(plan)
    const before = usePlannerStore.getState()
    const beforeIdentity = before.getIntentIdentity()
    usePlannerStore.getState().addVia({ lat: 40.4, lon: -76.7, label: "Gravel connector" })
    usePlannerStore.getState().updateVia(0, { lat: 40.41, lon: -76.71, label: "Dragged stop" })

    expect(usePlannerStore.getState()).toMatchObject({
      via: [{ lat: 40.41, lon: -76.71, label: "Dragged stop" }],
      selectedRouteId: route.id
    })
    expect(usePlannerStore.getState().plan).toBe(before.plan)
    expect(usePlannerStore.getState().getIntentIdentity()).not.toBe(beforeIdentity)

    usePlannerStore.getState().removeVia(0)
    expect(usePlannerStore.getState().via).toEqual([])
    expect(usePlannerStore.getState().plan).toBe(before.plan)
  })

  it("keeps bounded ride history and supports undo and redo", () => {
    const gravel = { lat: 40.4, lon: -76.7, label: "Gravel connector" }
    const overlook = { lat: 40.5, lon: -76.6, label: "Overlook" }

    usePlannerStore.getState().addVia(gravel)
    usePlannerStore.getState().addVia(overlook)
    usePlannerStore.getState().moveVia(1, 0)

    expect(usePlannerStore.getState()).toMatchObject({
      via: [overlook, gravel],
      canUndoRideChange: true,
      canRedoRideChange: false
    })

    usePlannerStore.getState().undoRideChange()
    expect(usePlannerStore.getState()).toMatchObject({
      via: [gravel, overlook],
      canUndoRideChange: true,
      canRedoRideChange: true,
      status: "idle"
    })

    usePlannerStore.getState().redoRideChange()
    expect(usePlannerStore.getState()).toMatchObject({
      via: [overlook, gravel],
      canRedoRideChange: false
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

    usePlannerStore.getState().undoRideChange()
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
      canUndoRideChange: false
    })
  })

  it("refuses a location seed once the rider has any ride history to diverge from", () => {
    usePlannerStore.getState().editRide({ targetMinutes: 90 }, "Longer ride")
    usePlannerStore.getState().undoRideChange()
    const undone = usePlannerStore.getState()
    expect(undone.start).toBeNull()
    expect(undone.canUndoRideChange).toBe(false)
    expect(undone.canRedoRideChange).toBe(true)

    usePlannerStore.getState().seedCurrentLocation({ lat: 40.27, lon: -76.88, label: "Current location" })

    // Seeding here would advance the identity and cut the redo branch with a
    // GPS callback the rider never asked for.
    const after = usePlannerStore.getState()
    expect(after.start).toBeNull()
    expect(after.getIntentIdentity()).toBe(undone.getIntentIdentity())
    expect(after.canRedoRideChange).toBe(true)
  })

  it("starts a new ride without inheriting the old ride's committed answer", () => {
    usePlannerStore.getState().setPoint("start", { lat: 40.2732, lon: -76.8867, label: "Harrisburg" })
    usePlannerStore.getState().applyPlan(plan)
    expect(usePlannerStore.getState().committedRide).not.toBeNull()

    usePlannerStore.getState().clearRoute()

    expect(usePlannerStore.getState()).toMatchObject({
      committedRide: null,
      resultIdentity: null,
      pendingResultIdentity: null,
      selectionSource: "automatic",
      isRecalculating: false
    })
  })

  it("clears a committed destination when the rider empties the field", () => {
    const finish = { lat: 40.3643, lon: -76.9513, label: "Original destination" }
    usePlannerStore.getState().setPoint("finish", finish)
    const before = usePlannerStore.getState().getIntentIdentity()

    usePlannerStore.getState().setPointQuery("finish", "  ")

    const cleared = usePlannerStore.getState()
    expect(cleared.finish).toBeNull()
    expect(cleared.finishQuery).toBe("")
    expect(cleared.getIntentIdentity()).not.toBe(before)
    // Undoing puts the destination back rather than leaving the rider to
    // retype it.
    usePlannerStore.getState().undoRideChange()
    expect(usePlannerStore.getState().finish).toEqual(finish)
  })

  it("drops a loop ride's destination in the same change that makes it a loop", () => {
    usePlannerStore.getState().replaceRoutePoints({
      start: { lat: 40.2732, lon: -76.8867, label: "Harrisburg" },
      finish: { lat: 39.8309, lon: -77.2311, label: "Gettysburg" },
      via: []
    })

    usePlannerStore.getState().editRide({ mode: "loop", finish: null }, "Switched to a loop ride")

    expect(usePlannerStore.getState()).toMatchObject({ mode: "loop", finish: null, finishQuery: "" })
    expect(usePlannerStore.getState().rideHistory.past).toHaveLength(2)
    usePlannerStore.getState().undoRideChange()
    expect(usePlannerStore.getState()).toMatchObject({
      mode: "destination",
      finish: { label: "Gettysburg" }
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

    usePlannerStore.getState().undoRideChange()
    expect(usePlannerStore.getState()).toMatchObject(original)
  })
})
