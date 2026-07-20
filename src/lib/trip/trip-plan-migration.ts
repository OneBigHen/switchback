import { DEFAULT_TRIP_STAGE_CONSTRAINTS, TRIP_PLAN_VERSION, type TripPlan } from "./trip-plan"
import type { TripStageConstraints } from "./stage-planner"

type LegacyTripPlan = Omit<TripPlan, "version" | "constraints"> & {
  version?: number
  constraints?: Partial<TripStageConstraints>
  commandModelVersion?: number
}

export function migrateTripPlanToCurrent(plan: LegacyTripPlan | (TripPlan & { commandModelVersion?: number })): TripPlan {
  if (plan.version === TRIP_PLAN_VERSION) return plan as TripPlan
  if (plan.version !== undefined && plan.version >= 3) {
    throw new Error(`Unsupported trip plan version ${plan.version}`)
  }
  return {
    ...plan,
    version: TRIP_PLAN_VERSION,
    constraints: {
      ...DEFAULT_TRIP_STAGE_CONSTRAINTS,
      ...(plan.constraints ?? {})
    }
  } as TripPlan
}

export function migrateTripPlanStageActions(plan: TripPlan): TripPlan {
  if ("commandModelVersion" in plan && !("actions" in plan)) {
    return { ...plan, actions: [] } as TripPlan
  }
  return plan
}
