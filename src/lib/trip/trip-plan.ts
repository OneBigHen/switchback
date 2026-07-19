import type { PlannedRoute } from "@/lib/routing/types"
import {
  validateTripStages,
  type TripStageConstraints,
  type TripStagePlan,
  type TripStageValidationError
} from "./stage-planner"

export const TRIP_PLAN_VERSION = 2

export const DEFAULT_TRIP_STAGE_CONSTRAINTS: TripStageConstraints = {
  targetDayMinutes: 300,
  fuelRangeMiles: 140,
  fuelReserveMiles: 25,
  breakEveryMinutes: 90,
  daylightMinutes: 270
}

export interface TripPlan {
  version: typeof TRIP_PLAN_VERSION
  id: string
  routeId: string
  name: string
  route: PlannedRoute
  constraints: TripStageConstraints
  stages: TripStagePlan["stages"]
  warnings: string[]
  createdAt: string
  updatedAt: string
}

export function createTripPlan(
  route: PlannedRoute,
  stagePlan: TripStagePlan,
  constraints: TripStageConstraints,
  now = new Date().toISOString()
): TripPlan {
  if (stagePlan.routeId !== route.id) throw new Error("Trip stages must belong to the route being saved.")
  return {
    version: TRIP_PLAN_VERSION,
    id: `trip-${crypto.randomUUID()}`,
    routeId: route.id,
    name: route.name,
    route: structuredClone(route),
    constraints: structuredClone(constraints),
    stages: structuredClone(stagePlan.stages),
    warnings: [...stagePlan.warnings],
    createdAt: now,
    updatedAt: now
  }
}

export type TripPlanValidationError =
  | { code: "version_mismatch"; message: string }
  | { code: "route_mismatch"; message: string }
  | { code: "route_invalid"; message: string }
  | { code: "stages_invalid"; message: string; nestedErrors: TripStageValidationError[] }

export type TripPlanValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; warnings: string[]; errors: TripPlanValidationError[] }

/**
 * Pure validation of a {@link TripPlan} against its declared route and
 * constraints. Returns typed, actionable errors. Does not perform IndexedDB
 * or UI changes. Useful for validating user edits before save.
 */
export function validateTripPlan(plan: TripPlan, route: PlannedRoute): TripPlanValidationResult {
  const errors: TripPlanValidationError[] = []
  const warnings: string[] = []

  if (plan.version !== TRIP_PLAN_VERSION) {
    errors.push({
      code: "version_mismatch",
      message: `Trip plan version ${plan.version} does not match required version ${TRIP_PLAN_VERSION}.`
    })
  }

  if (plan.routeId !== route.id) {
    errors.push({
      code: "route_mismatch",
      message: `Trip plan routeId (${plan.routeId}) does not match route.id (${route.id}).`
    })
  }

  if (route.previewOnly === true || route.geometry.length < 2) {
    errors.push({
      code: "route_invalid",
      message: "Route must be verified and contain at least two geometry coordinates."
    })
  }

  const stageResult = validateTripStages(
    { routeId: plan.routeId, stages: plan.stages, warnings: plan.warnings },
    route,
    plan.constraints
  )
  warnings.push(...stageResult.warnings)
  if (!stageResult.ok) {
    errors.push({
      code: "stages_invalid",
      message: "Trip plan stages failed validation.",
      nestedErrors: stageResult.errors
    })
  }

  if (errors.length === 0) {
    return { ok: true, warnings }
  }
  return { ok: false, warnings, errors }
}
