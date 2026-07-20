import { TripPlanLibrary } from "@/lib/storage/trip-plan-library"
import type { TripPlan } from "@/lib/trip/trip-plan"
import { createTripPlan } from "@/lib/trip/trip-plan"
import type { TripStage, TripStageConstraints } from "@/lib/trip/stage-planner"
import {
  applyTripPlanCommand,
  type TripPlanCommand,
  type TripPlanCommandResult,
  type TripPlanEvent
} from "@/lib/trip/trip-command"
import type { PlannedRoute } from "@/lib/routing/types"

const EMPTY_ROUTE: PlannedRoute = {
  id: "empty",
  name: "empty",
  profile: "twisty",
  geometry: [[-76.5, 40.0]],
  waypoints: [],
  instructions: [],
  distanceMiles: 0,
  durationMinutes: 0,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 0,
  turnCount: 0,
  roadMix: {},
  surfaceMix: {},
  routingSource: "preview",
  previewOnly: true
}

function buildSeedPlan(): TripPlanCommandResult["plan"] {
  const plan = createTripPlan(
    EMPTY_ROUTE,
    { routeId: "empty", stages: [], warnings: [] },
    { targetDayMinutes: 360, fuelRangeMiles: 160, fuelReserveMiles: 30, breakEveryMinutes: 90, daylightMinutes: 600 },
    new Date().toISOString()
  )
  return applyTripPlanCommand(plan as never, {
    type: "rename",
    name: "seed"
  }).result.plan
}

let SEED: TripPlanCommandResult["plan"] | null = null
function seedPlan(): TripPlanCommandResult["plan"] {
  if (!SEED) SEED = buildSeedPlan()
  return SEED
}

export interface TripPlanController {
  readonly plan: TripPlanCommandResult["plan"] | null
  readonly events: readonly TripPlanEvent[]
  readonly validation: TripPlanCommandResult["validation"]
  create(route: PlannedRoute, name: string, constraints: TripStageConstraints, stages: TripStage[]): void
  dispatch(command: TripPlanCommand): void
  save(): Promise<TripPlan>
  load(id: string): Promise<void>
  list(): Promise<TripPlan[]>
  remove(id: string): Promise<void>
  duplicate(id: string, newName: string): Promise<TripPlan>
  reset(): void
}

export function createTripPlanController(
  library = new TripPlanLibrary()
): TripPlanController {
  let current: TripPlanCommandResult["plan"] | null = null
  let pendingEvents: TripPlanEvent[] = []

  return {
    get plan() { return current },
    get events() { return pendingEvents },
    get validation() {
      if (!current) return { ok: false as const, warnings: [], errors: [] }
      return applyTripPlanCommand(current, { type: "rename", name: current.name }).result.validation
    },
    create(route, name, constraints, stages) {
      const timestamp = new Date().toISOString()
      pendingEvents = [{ type: "created", at: timestamp }]
      const plan = createTripPlan(
        route,
        { routeId: route.id, stages, warnings: [] },
        constraints,
        timestamp
      )
      const base = applyTripPlanCommand(seedPlan(), {
        type: "create",
        route,
        name,
        constraints,
        stages
      }).result.plan
      current = {
        ...base,
        id: plan.id,
        name,
        routeId: plan.routeId,
        route: plan.route,
        stages,
        createdAt: plan.createdAt,
        updatedAt: timestamp
      }
    },
    dispatch(command: TripPlanCommand) {
      if (!current) return
      const outcome = applyTripPlanCommand(current, command)
      current = outcome.result.plan
      pendingEvents = [...pendingEvents, ...outcome.events]
    },
    async save() {
      if (!current) throw new Error("No trip plan to save.")
      const plain: TripPlan = {
        id: current.id,
        routeId: current.routeId,
        name: current.name,
        version: 2,
        route: current.route,
        stages: current.stages,
        constraints: current.constraints,
        warnings: current.warnings,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString()
      }
      const saved = await library.save(plain)
      pendingEvents = []
      return saved
    },
    async load(id) {
      const trip = await library.get(id)
      if (!trip) throw new Error(`Trip ${id} not found.`)
      const base = applyTripPlanCommand(seedPlan(), {
        type: "create",
        route: trip.route,
        name: trip.name,
        constraints: trip.constraints,
        stages: trip.stages
      }).result.plan
      current = {
        ...base,
        id: trip.id,
        name: trip.name,
        routeId: trip.routeId,
        route: trip.route,
        stages: trip.stages,
        createdAt: trip.createdAt,
        updatedAt: new Date().toISOString()
      }
      pendingEvents = []
    },
    async list() { return library.list() },
    async remove(id) {
      await library.remove(id)
      if (current?.id === id) { current = null; pendingEvents = [] }
    },
    async duplicate(id, newName) {
      const trip = await library.get(id)
      if (!trip) throw new Error(`Trip ${id} not found.`)
      const plan = createTripPlan(
        trip.route,
        { routeId: trip.routeId, stages: trip.stages, warnings: trip.warnings },
        trip.constraints,
        new Date().toISOString()
      )
      return library.save({ ...plan, name: newName, updatedAt: new Date().toISOString() })
    },
    reset() { current = null; pendingEvents = [] }
  }
}
