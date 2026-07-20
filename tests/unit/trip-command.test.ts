import { describe, expect, it } from "vitest"
import { buildTripStages } from "@/lib/trip/stage-planner"
import { createTripPlan } from "@/lib/trip/trip-plan"
import { applyTripPlanCommand, TRIP_COMMAND_MODEL_VERSION, type TripPlanAlternate, type TripPlanChecklistItem, type TripPlanCommand, type TripPlanCommandResult } from "@/lib/trip/trip-command"
import type { PlannedRoute } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "command-route",
  name: "Command route",
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

const alternateRoute: PlannedRoute = {
  ...route,
  id: "alternate-route",
  name: "Alternate route",
  geometry: [[-77, 40], [-76.25, 40.35], [-75.5, 40.5]],
  twistiness: 72
}

const constraints = {
  targetDayMinutes: 300,
  fuelRangeMiles: 220,
  fuelReserveMiles: 30,
  breakEveryMinutes: 90
}

function stages() {
  return buildTripStages(route, constraints).stages
}

function seedPlan(): TripPlanCommandResult["plan"] {
  const plan = createTripPlan(route, buildTripStages(route, constraints), constraints, "2026-07-18T00:00:00.000Z")
  return {
    ...plan,
    commandModelVersion: TRIP_COMMAND_MODEL_VERSION,
    actions: [],
    alternates: [],
    checklist: [],
    fuelEnvelope: null,
    daylightWindows: [],
    serviceStops: [],
    notes: {},
    snapshots: []
  }
}

function createCommandPlan(name = "New trip") {
  return applyTripPlanCommand(seedPlan(), {
    type: "create",
    route,
    name,
    constraints,
    stages: stages()
  }).result.plan
}

function expectValidation(value: TripPlanCommandResult) {
  expect(value.validation).toBeDefined()
  expect(typeof value.validation.ok).toBe("boolean")
}

describe("trip command model", () => {
  it("create produces a valid extended trip plan with empty command collections", () => {
    const { result, events } = applyTripPlanCommand(seedPlan(), {
      type: "create",
      route,
      name: "Closure ride",
      constraints,
      stages: stages()
    })

    expect(result.validation.ok).toBe(true)
    expect(result.plan).toMatchObject({ commandModelVersion: 1, name: "Closure ride", routeId: route.id })
    expect(result.plan.actions).toEqual([])
    expect(result.plan.alternates).toEqual([])
    expect(result.plan.checklist).toEqual([])
    expect(result.plan.fuelEnvelope).toBeNull()
    expect(result.plan.daylightWindows).toEqual([])
    expect(result.plan.serviceStops).toEqual([])
    expect(result.plan.notes).toEqual({})
    expect(result.plan.snapshots).toEqual([])
    expect(events).toMatchObject([{ type: "created" }])
  })

  it("rename updates plan name only", () => {
    const plan = createCommandPlan("Original name")
    const { result } = applyTripPlanCommand(plan, { type: "rename", name: "Renamed trip" })

    expect(result.plan.name).toBe("Renamed trip")
    expect(result.plan.route.name).toBe(route.name)
  })

  it("reorderStages succeeds for a complete permutation and rejects duplicate or missing ids", () => {
    const plan = createCommandPlan()
    const orderedStageIds = plan.stages.map((stage) => stage.id).toReversed()
    const valid = applyTripPlanCommand(plan, { type: "reorderStages", orderedStageIds })

    expect(valid.result.plan.stages.map((stage) => stage.id)).toEqual(orderedStageIds)
    expect(valid.events).toMatchObject([{ type: "stage-reordered" }])

    const duplicate = applyTripPlanCommand(plan, { type: "reorderStages", orderedStageIds: [plan.stages[0]!.id, plan.stages[0]!.id, plan.stages[2]!.id] })
    expect(duplicate.result.validation.ok).toBe(false)

    const missing = applyTripPlanCommand(plan, { type: "reorderStages", orderedStageIds: [plan.stages[0]!.id, plan.stages[1]!.id] })
    expect(missing.result.validation.ok).toBe(false)
  })

  it("skipStage rejects the terminal stage and records non-terminal skips", () => {
    const plan = createCommandPlan()
    const terminal = plan.stages.at(-1)!
    const rejected = applyTripPlanCommand(plan, { type: "skipStage", stageId: terminal.id })
    expect(rejected.result.validation.ok).toBe(false)

    const skipped = applyTripPlanCommand(plan, { type: "skipStage", stageId: plan.stages[0]!.id, reason: "weather" })
    expect(skipped.events).toMatchObject([{ type: "stage-skipped", stageId: plan.stages[0]!.id }])
    expect(skipped.result.plan.actions).toContainEqual(expect.objectContaining({ action: "skip", stageId: plan.stages[0]!.id, note: "weather" }))
  })

  it("splitStage inserts a deterministic new stage and preserves total route distance", () => {
    const plan = createCommandPlan()
    const beforeDistance = plan.stages.reduce((sum, stage) => sum + stage.distanceMiles, 0)
    const split = applyTripPlanCommand(plan, { type: "splitStage", stageId: plan.stages[0]!.id, at: [-76.75, 40.1], newStageId: "stage-1b" })
    const afterDistance = split.result.plan.stages.reduce((sum, stage) => sum + stage.distanceMiles, 0)

    expect(split.result.plan.stages).toHaveLength(plan.stages.length + 1)
    expect(split.result.plan.stages.map((stage) => stage.id)).toContain("stage-1b")
    expect(afterDistance).toBeCloseTo(beforeDistance, 1)
    expect(split.events).toMatchObject([{ type: "stage-split", newStageId: "stage-1b" }])
  })

  it("mergeStages merges adjacent stages and rejects non-adjacent merges", () => {
    const plan = createCommandPlan()
    const merged = applyTripPlanCommand(plan, { type: "mergeStages", firstStageId: plan.stages[0]!.id, secondStageId: plan.stages[1]!.id })

    expect(merged.result.plan.stages).toHaveLength(plan.stages.length - 1)
    expect(merged.result.plan.stages[0]).toMatchObject({ id: plan.stages[0]!.id, endMile: plan.stages[1]!.endMile })
    expect(merged.events).toMatchObject([{ type: "stage-merged" }])

    const rejected = applyTripPlanCommand(plan, { type: "mergeStages", firstStageId: plan.stages[0]!.id, secondStageId: plan.stages[2]!.id })
    expect(rejected.result.validation.ok).toBe(false)
  })

  it("roundtrips notes and checklist item commands", () => {
    const item: TripPlanChecklistItem = { id: "fuel-card", label: "Pack fuel card", completed: false, kind: "documents" }
    const withNotes = applyTripPlanCommand(createCommandPlan(), { type: "setNotes", stageId: null, notes: "Leave early" }).result.plan
    const added = applyTripPlanCommand(withNotes, { type: "addChecklistItem", item }).result.plan
    const checked = applyTripPlanCommand(added, { type: "setChecklistItem", itemId: item.id, completed: true }).result.plan
    const removed = applyTripPlanCommand(checked, { type: "removeChecklistItem", itemId: item.id }).result.plan

    expect(withNotes.notes.root).toBe("Leave early")
    expect(added.checklist).toContainEqual(item)
    expect(checked.checklist).toContainEqual({ ...item, completed: true })
    expect(removed.checklist).toEqual([])
  })

  it("adds and promotes alternates while preserving the previous route as an alternate", () => {
    const alternate: TripPlanAlternate = {
      id: "alt-1",
      label: "Valley option",
      routeSnapshot: alternateRoute,
      createdAt: "2026-07-18T01:00:00.000Z"
    }
    const added = applyTripPlanCommand(createCommandPlan(), { type: "addAlternate", alternate }).result.plan
    const promoted = applyTripPlanCommand(added, { type: "promoteAlternate", alternateId: alternate.id }).result.plan

    expect(promoted.route).toEqual(alternateRoute)
    expect(promoted.alternates).toHaveLength(1)
    expect(promoted.alternates[0]?.routeSnapshot).toEqual(route)
  })

  it("restores a snapshot payload with snapshot history reset", () => {
    const noted = applyTripPlanCommand(createCommandPlan("Snapshot source"), { type: "setNotes", stageId: null, notes: "Original notes" }).result.plan
    const snapshotted = applyTripPlanCommand(noted, { type: "snapshot", snapshotLabel: "Before edits" }).result.plan
    const renamed = applyTripPlanCommand(snapshotted, { type: "rename", name: "Edited after snapshot" }).result.plan
    const restored = applyTripPlanCommand(renamed, { type: "restoreSnapshot", snapshotId: snapshotted.snapshots[0]!.id }).result.plan

    expect({ name: restored.name, notes: restored.notes, stages: restored.stages, snapshots: restored.snapshots }).toEqual({
      name: noted.name,
      notes: noted.notes,
      stages: noted.stages,
      snapshots: []
    })
  })

  it("returns validation after every command", () => {
    const plan = createCommandPlan()
    const commands: TripPlanCommand[] = [
      { type: "rename", name: "Validated" },
      { type: "setNotes", stageId: null, notes: "validated" },
      { type: "addChecklistItem", item: { id: "rest", label: "Rest", completed: false, kind: "rest" } },
      { type: "setFuelEnvelope", envelope: { rangeMiles: 220, reserveMiles: 30, plannedStops: [], warnings: [] } },
      { type: "setDaylightWindow", window: { date: "2026-07-18", sunriseAt: "2026-07-18T10:00:00.000Z", sunsetAt: "2026-07-19T00:00:00.000Z", daylightMinutes: 840 } },
      { type: "addServiceStop", stop: { id: "fuel-1", kind: "fuel", label: "Fuel", coordinate: [-76, 40], mileFromStart: 10, confirmed: false, source: "test" } },
      { type: "snapshot", snapshotLabel: "validated" }
    ]

    for (const command of commands) {
      expectValidation(applyTripPlanCommand(plan, command).result)
    }
  })
})
