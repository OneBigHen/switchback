import { turfPointAlong } from "@/lib/client/geo-math"
import type { Coordinate, PlannedRoute, Waypoint } from "@/lib/routing/types"

export interface TripStageConstraints {
  targetDayMinutes: number
  fuelRangeMiles: number
  fuelReserveMiles: number
  breakEveryMinutes: number
  daylightMinutes?: number
}

export interface TripStopProposal {
  id: string
  kind: "fuel" | "break" | "overnight"
  label: string
  mileFromStart: number
  coordinate: Coordinate
}

export interface TripStage {
  id: string
  label: string
  startMile: number
  endMile: number
  distanceMiles: number
  durationMinutes: number
  start: Waypoint
  finish: Waypoint
  fuelStops: TripStopProposal[]
  breaks: TripStopProposal[]
  overnightLabel?: string
}

export interface TripStagePlan {
  routeId: string
  stages: TripStage[]
  warnings: string[]
}

export function withOvernightLabel(plan: TripStagePlan, stageId: string, label: string): TripStagePlan {
  return {
    ...plan,
    stages: plan.stages.map((stage) => stage.id === stageId && stage.id !== plan.stages.at(-1)?.id
      ? { ...stage, overnightLabel: label.trim().slice(0, 120) || undefined }
      : stage)
  }
}

function coordinateAt(route: PlannedRoute, fraction: number): Coordinate {
  const bounded = Math.max(0, Math.min(1, fraction))
  if (route.geometry.length === 0) return [0, 0]
  if (route.geometry.length === 1) return route.geometry[0]!
  const totalMeters = route.distanceMiles * 1609.344
  const targetMeters = bounded * totalMeters
  return turfPointAlong(route.geometry, targetMeters) ?? route.geometry[0]!
}

function waypointAt(route: PlannedRoute, mile: number, label: string): Waypoint {
  const coordinate = coordinateAt(route, route.distanceMiles > 0 ? mile / route.distanceMiles : 0)
  return { lat: coordinate[1], lon: coordinate[0], label }
}

function validate(constraints: TripStageConstraints) {
  for (const [key, value] of Object.entries(constraints)) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`${key} must be a positive number.`)
    }
  }
  if (constraints.fuelReserveMiles >= constraints.fuelRangeMiles) {
    throw new Error("Fuel reserve must be smaller than the fuel range.")
  }
}

export function buildTripStages(route: PlannedRoute, constraints: TripStageConstraints): TripStagePlan {
  validate(constraints)
  if (route.previewOnly || route.geometry.length < 2) {
    throw new Error("A verified route is required before creating trip stages.")
  }
  const stageCount = Math.max(1, Math.ceil(route.durationMinutes / constraints.targetDayMinutes))
  const stageDuration = route.durationMinutes / stageCount
  const stageDistance = route.distanceMiles / stageCount
  const usableFuelMiles = constraints.fuelRangeMiles - constraints.fuelReserveMiles
  const stages = Array.from({ length: stageCount }, (_, index): TripStage => {
    const startMile = stageDistance * index
    const endMile = index === stageCount - 1 ? route.distanceMiles : stageDistance * (index + 1)
    const distanceMiles = endMile - startMile
    const durationMinutes = index === stageCount - 1
      ? route.durationMinutes - stageDuration * (stageCount - 1)
      : stageDuration
    const fuelStops: TripStopProposal[] = []
    for (let miles = usableFuelMiles; miles < distanceMiles - 0.01; miles += usableFuelMiles) {
      const absoluteMile = startMile + miles
      fuelStops.push({
        id: `stage-${index + 1}-fuel-${fuelStops.length + 1}`,
        kind: "fuel",
        label: "Fuel recommended",
        mileFromStart: Number(miles.toFixed(1)),
        coordinate: coordinateAt(route, absoluteMile / route.distanceMiles)
      })
    }
    const breaks: TripStopProposal[] = []
    for (let minutes = constraints.breakEveryMinutes; minutes < durationMinutes - 0.01; minutes += constraints.breakEveryMinutes) {
      const stageFraction = minutes / durationMinutes
      const mile = startMile + distanceMiles * stageFraction
      breaks.push({
        id: `stage-${index + 1}-break-${breaks.length + 1}`,
        kind: "break",
        label: "Rest / food window",
        mileFromStart: Number((mile - startMile).toFixed(1)),
        coordinate: coordinateAt(route, mile / route.distanceMiles)
      })
    }
    return {
      id: `stage-${index + 1}`,
      label: `Day ${index + 1}`,
      startMile: Number(startMile.toFixed(1)),
      endMile: Number(endMile.toFixed(1)),
      distanceMiles: Number(distanceMiles.toFixed(1)),
      durationMinutes: Number(durationMinutes.toFixed(0)),
      start: waypointAt(route, startMile, index === 0 ? "Trip start" : `Day ${index + 1} start`),
      finish: waypointAt(route, endMile, index === stageCount - 1 ? "Trip finish" : `Day ${index + 1} overnight`),
      fuelStops,
      breaks
    }
  })
  const warnings: string[] = []
  const daylightMinutes = constraints.daylightMinutes
  if (daylightMinutes !== undefined && stages.some((stage) => stage.durationMinutes > daylightMinutes)) {
    warnings.push("Each stage is longer than the selected daylight window.")
  }
  return { routeId: route.id, stages, warnings }
}

export type TripStageValidationError =
  | { code: "missing_stages"; message: string }
  | { code: "stage_order"; stageId: string; message: string }
  | { code: "stage_overlap"; stageId: string; message: string }
  | { code: "stage_mile_range"; stageId: string; message: string }
  | { code: "terminal_destination"; message: string }
  | { code: "fuel_range_invalid"; message: string }
  | { code: "fuel_exceeds_stage"; stageId: string; message: string }
  | { code: "daylight_exceeded"; stageId: string; message: string }
  | { code: "overnight_label_outside_intermediate"; stageId: string; message: string }

export type TripStageValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; warnings: string[]; errors: TripStageValidationError[] }

const STAGE_TOLERANCE = 0.1

/**
 * Pure validation of a proposed multi-day trip plan against fuel, daylight, and
 * stage-ordering rules. Does not mutate inputs. Returns typed, actionable
 * errors. Mirrors, but does not replace, the warnings produced by
 * {@link buildTripStages} — callers can validate user-edited plans separately.
 */
export function validateTripStages(
  plan: TripStagePlan,
  route: PlannedRoute,
  constraints: TripStageConstraints
): TripStageValidationResult {
  const errors: TripStageValidationError[] = []
  const warnings: string[] = []

  if (plan.stages.length === 0) {
    errors.push({ code: "missing_stages", message: "Trip plan must have at least one stage." })
    return { ok: false, warnings, errors }
  }

  for (const stage of plan.stages) {
    if (!(stage.startMile < stage.endMile)) {
      errors.push({
        code: "stage_mile_range",
        stageId: stage.id,
        message: `Stage ${stage.id}: startMile must be less than endMile.`
      })
    }
    const expectedDistance = stage.endMile - stage.startMile
    if (Math.abs(stage.distanceMiles - expectedDistance) > STAGE_TOLERANCE) {
      errors.push({
        code: "stage_mile_range",
        stageId: stage.id,
        message: `Stage ${stage.id}: distanceMiles must equal endMile - startMile.`
      })
    }
  }

  for (let i = 1; i < plan.stages.length; i += 1) {
    const prev = plan.stages[i - 1]!
    const curr = plan.stages[i]!
    if (curr.startMile < prev.startMile) {
      errors.push({
        code: "stage_order",
        stageId: curr.id,
        message: `Stage ${curr.id}: startMile must be greater than or equal to the previous stage's startMile.`
      })
    }
    if (curr.startMile < prev.endMile - STAGE_TOLERANCE) {
      errors.push({
        code: "stage_overlap",
        stageId: curr.id,
        message: `Stage ${curr.id}: startMile must be greater than or equal to the previous stage's endMile.`
      })
    }
  }

  const finalStage = plan.stages.at(-1)!
  if (Math.abs(finalStage.endMile - route.distanceMiles) > STAGE_TOLERANCE) {
    errors.push({
      code: "terminal_destination",
      message: `Final stage must end at the route's total distanceMiles (route.distanceMiles=${route.distanceMiles}).`
    })
  }

  if (
    !Number.isFinite(constraints.fuelRangeMiles) ||
    constraints.fuelRangeMiles <= 0 ||
    !Number.isFinite(constraints.fuelReserveMiles) ||
    constraints.fuelReserveMiles < 0 ||
    constraints.fuelReserveMiles >= constraints.fuelRangeMiles
  ) {
    errors.push({
      code: "fuel_range_invalid",
      message: "Constraints require fuelRangeMiles > 0 and 0 <= fuelReserveMiles < fuelRangeMiles."
    })
  }

  const usableFuelMiles = constraints.fuelRangeMiles - constraints.fuelReserveMiles
  for (const stage of plan.stages) {
    if (
      Number.isFinite(usableFuelMiles) &&
      usableFuelMiles > 0 &&
      stage.distanceMiles > usableFuelMiles &&
      stage.fuelStops.length === 0
    ) {
      errors.push({
        code: "fuel_exceeds_stage",
        stageId: stage.id,
        message: `Stage ${stage.id}: distanceMiles exceeds usable fuel range (${usableFuelMiles} mi) and has no fuel stops.`
      })
    }
  }

  if (constraints.daylightMinutes !== undefined) {
    for (const stage of plan.stages) {
      if (stage.durationMinutes > constraints.daylightMinutes) {
        errors.push({
          code: "daylight_exceeded",
          stageId: stage.id,
          message: `Stage ${stage.id}: durationMinutes (${stage.durationMinutes}) exceeds daylightMinutes (${constraints.daylightMinutes}).`
        })
      }
    }
    if (plan.stages.some((stage) => stage.durationMinutes > constraints.daylightMinutes!)) {
      warnings.push("Each stage is longer than the selected daylight window.")
    }
  }

  if (finalStage.overnightLabel !== undefined) {
    warnings.push(
      `Stage ${finalStage.id}: overnightLabel is only valid on intermediate stages, not the final stage.`
    )
  }

  if (errors.length === 0) {
    return { ok: true, warnings }
  }
  return { ok: false, warnings, errors }
}
