import type { PlannedRoute, Waypoint, Coordinate } from "@/lib/routing/types"
import { createTripPlan, validateTripPlan, type TripPlan, type TripPlanValidationError } from "./trip-plan"
import { validateTripStages, type TripStage, type TripStageConstraints, type TripStopProposal, type TripStageValidationError } from "./stage-planner"

export const TRIP_COMMAND_MODEL_VERSION = 1 as const

export type TripPlanVersion = 1 | 2

export type TripStageDeliberateAction =
  | "skip"
  | "reorder"
  | "split"
  | "merge"
  | "extend"

export interface TripStageActionRecord {
  readonly stageId: string
  readonly action: TripStageDeliberateAction
  readonly at: string
  readonly note?: string
  readonly affectedStageIds: readonly string[]
}

export interface TripPlanAlternate {
  readonly id: string
  readonly label: string
  readonly routeSnapshot: PlannedRoute
  readonly createdAt: string
  readonly notes?: string
}

export interface TripPlanChecklistItem {
  readonly id: string
  readonly label: string
  readonly completed: boolean
  readonly kind: "fuel" | "gear" | "rest" | "documents" | "media" | "other"
}

export interface TripFuelEnvelope {
  readonly rangeMiles: number
  readonly reserveMiles: number
  readonly plannedStops: readonly TripStopProposal[]
  readonly warnings: readonly string[]
}

export interface TripDaylightWindow {
  readonly date: string
  readonly sunriseAt: string
  readonly sunsetAt: string
  readonly daylightMinutes: number
  readonly notes?: string
}

export interface TripServiceStop {
  readonly id: string
  readonly kind: "lodging" | "camping" | "fuel" | "food" | "repair"
  readonly label: string
  readonly coordinate: Coordinate
  readonly mileFromStart: number
  readonly confirmed: boolean
  readonly source: string
}

export type TripPlanCommand =
  | { type: "create"; route: PlannedRoute; name: string; constraints: TripStageConstraints; stages: TripStage[] }
  | { type: "rename"; name: string }
  | { type: "reorderStages"; orderedStageIds: readonly string[] }
  | { type: "skipStage"; stageId: string; reason?: string }
  | { type: "splitStage"; stageId: string; at: Coordinate; newStageId: string }
  | { type: "mergeStages"; firstStageId: string; secondStageId: string }
  | { type: "extendStage"; stageId: string; newFinish: Waypoint }
  | { type: "setNotes"; stageId: string | null; notes: string }
  | { type: "setChecklistItem"; itemId: string; completed: boolean }
  | { type: "addChecklistItem"; item: TripPlanChecklistItem }
  | { type: "removeChecklistItem"; itemId: string }
  | { type: "addAlternate"; alternate: TripPlanAlternate }
  | { type: "promoteAlternate"; alternateId: string }
  | { type: "setFuelEnvelope"; envelope: TripFuelEnvelope }
  | { type: "setDaylightWindow"; window: TripDaylightWindow }
  | { type: "addServiceStop"; stop: TripServiceStop }
  | { type: "removeServiceStop"; stopId: string }
  | { type: "confirmServiceStop"; stopId: string }
  | { type: "snapshot"; snapshotLabel: string }
  | { type: "restoreSnapshot"; snapshotId: string }

export interface TripPlanCommandResult {
  readonly plan: TripPlan & {
    readonly commandModelVersion: typeof TRIP_COMMAND_MODEL_VERSION
    readonly actions: readonly TripStageActionRecord[]
    readonly alternates: readonly TripPlanAlternate[]
    readonly checklist: readonly TripPlanChecklistItem[]
    readonly fuelEnvelope: TripFuelEnvelope | null
    readonly daylightWindows: readonly TripDaylightWindow[]
    readonly serviceStops: readonly TripServiceStop[]
    readonly notes: Readonly<Record<string, string>>
    readonly snapshots: readonly { id: string; label: string; at: string; payload: TripPlan }[]
  }
  readonly validation: { ok: true; warnings: string[] } | { ok: false; warnings: string[]; errors: (TripPlanValidationError | TripStageValidationError)[] }
}

export type TripPlanEvent =
  | { type: "created"; at: string }
  | { type: "stage-skipped"; stageId: string; at: string }
  | { type: "stage-reordered"; orderedStageIds: readonly string[]; at: string }
  | { type: "stage-split"; originalId: string; newStageId: string; at: string }
  | { type: "stage-merged"; intoStageId: string; absorbedStageId: string; at: string }
  | { type: "stage-extended"; stageId: string; at: string }
  | { type: "alternate-added"; alternateId: string; at: string }
  | { type: "alternate-promoted"; alternateId: string; at: string }
  | { type: "snapshot-created"; snapshotId: string; label: string; at: string }
  | { type: "snapshot-restored"; snapshotId: string; at: string }

type ExtendedTripPlan = TripPlanCommandResult["plan"]
type CommandValidation = TripPlanCommandResult["validation"]
type CommandValidationError = TripPlanValidationError | TripStageValidationError

function clone<T>(value: T): T {
  return structuredClone(value)
}

function withCommandDefaults(plan: TripPlan | ExtendedTripPlan): ExtendedTripPlan {
  const maybeExtended = plan as Partial<ExtendedTripPlan>
  return {
    ...clone(plan),
    commandModelVersion: TRIP_COMMAND_MODEL_VERSION,
    actions: clone(maybeExtended.actions ?? []),
    alternates: clone(maybeExtended.alternates ?? []),
    checklist: clone(maybeExtended.checklist ?? []),
    fuelEnvelope: maybeExtended.fuelEnvelope === undefined ? null : clone(maybeExtended.fuelEnvelope),
    daylightWindows: clone(maybeExtended.daylightWindows ?? []),
    serviceStops: clone(maybeExtended.serviceStops ?? []),
    notes: clone(maybeExtended.notes ?? {}),
    snapshots: clone(maybeExtended.snapshots ?? [])
  }
}

function uniqueWarnings(...warningSets: readonly string[][]): string[] {
  return [...new Set(warningSets.flat())]
}

function validateExtendedPlan(plan: ExtendedTripPlan, commandErrors: readonly CommandValidationError[] = []): CommandValidation {
  const planValidation = validateTripPlan(plan, plan.route)
  const stageValidation = validateTripStages(
    { routeId: plan.routeId, stages: plan.stages, warnings: plan.warnings },
    plan.route,
    plan.constraints
  )
  const warnings = uniqueWarnings(planValidation.warnings, stageValidation.warnings)
  const errors: CommandValidationError[] = [...commandErrors]
  if (!planValidation.ok) errors.push(...planValidation.errors)
  if (!stageValidation.ok) errors.push(...stageValidation.errors)
  if (errors.length === 0) return { ok: true, warnings }
  return { ok: false, warnings, errors }
}

function buildResult(plan: ExtendedTripPlan, commandErrors: readonly CommandValidationError[] = []): TripPlanCommandResult {
  return { plan, validation: validateExtendedPlan(plan, commandErrors) }
}

function commandError(stageId: string, message: string): TripStageValidationError {
  return { code: "stage_order", stageId, message }
}

function replaceStage(plan: ExtendedTripPlan, stageId: string, update: (stage: TripStage) => TripStage): ExtendedTripPlan {
  return {
    ...plan,
    stages: plan.stages.map((stage) => stage.id === stageId ? update(stage) : stage)
  }
}

function actionRecord(stageId: string, action: TripStageDeliberateAction, at: string, affectedStageIds: readonly string[], note?: string): TripStageActionRecord {
  return note === undefined
    ? { stageId, action, at, affectedStageIds }
    : { stageId, action, at, note, affectedStageIds }
}

function splitStop(stop: TripStopProposal, splitDistance: number, secondStageStartOffset: number): ["first" | "second", TripStopProposal] {
  if (stop.mileFromStart <= splitDistance) return ["first", stop]
  return ["second", { ...stop, mileFromStart: Number((stop.mileFromStart - secondStageStartOffset).toFixed(1)) }]
}

function splitStage(stage: TripStage, at: Coordinate, newStageId: string): [TripStage, TripStage] {
  const splitMile = Number(((stage.startMile + stage.endMile) / 2).toFixed(1))
  const firstDistance = Number((splitMile - stage.startMile).toFixed(1))
  const secondDistance = Number((stage.endMile - splitMile).toFixed(1))
  const firstDuration = Math.max(1, Math.round(stage.durationMinutes * (firstDistance / stage.distanceMiles)))
  const secondDuration = Math.max(1, stage.durationMinutes - firstDuration)
  const splitWaypoint: Waypoint = { lat: at[1], lon: at[0], label: `${stage.label} split` }
  const firstFuelStops: TripStopProposal[] = []
  const secondFuelStops: TripStopProposal[] = []
  for (const stop of stage.fuelStops) {
    const [side, nextStop] = splitStop(stop, firstDistance, firstDistance)
    if (side === "first") firstFuelStops.push(nextStop)
    else secondFuelStops.push(nextStop)
  }
  const firstBreaks: TripStopProposal[] = []
  const secondBreaks: TripStopProposal[] = []
  for (const stop of stage.breaks) {
    const [side, nextStop] = splitStop(stop, firstDistance, firstDistance)
    if (side === "first") firstBreaks.push(nextStop)
    else secondBreaks.push(nextStop)
  }
  return [
    {
      ...stage,
      endMile: splitMile,
      distanceMiles: firstDistance,
      durationMinutes: firstDuration,
      finish: splitWaypoint,
      fuelStops: firstFuelStops,
      breaks: firstBreaks,
      overnightLabel: undefined
    },
    {
      ...stage,
      id: newStageId,
      label: `${stage.label} continuation`,
      startMile: splitMile,
      distanceMiles: secondDistance,
      durationMinutes: secondDuration,
      start: splitWaypoint,
      fuelStops: secondFuelStops,
      breaks: secondBreaks
    }
  ]
}

function mergeStagePair(first: TripStage, second: TripStage): TripStage {
  const firstDistance = first.endMile - first.startMile
  return {
    ...first,
    endMile: second.endMile,
    distanceMiles: Number((second.endMile - first.startMile).toFixed(1)),
    durationMinutes: first.durationMinutes + second.durationMinutes,
    finish: second.finish,
    fuelStops: [
      ...first.fuelStops,
      ...second.fuelStops.map((stop) => ({ ...stop, mileFromStart: Number((firstDistance + stop.mileFromStart).toFixed(1)) }))
    ],
    breaks: [
      ...first.breaks,
      ...second.breaks.map((stop) => ({ ...stop, mileFromStart: Number((firstDistance + stop.mileFromStart).toFixed(1)) }))
    ],
    overnightLabel: second.overnightLabel
  }
}

function snapshotPayload(plan: ExtendedTripPlan): TripPlan {
  const payload = clone(plan) as unknown as Record<string, unknown>
  delete payload.snapshots
  return payload as unknown as TripPlan
}

export function applyTripPlanCommand(
  plan: TripPlanCommandResult["plan"],
  command: TripPlanCommand
): { result: TripPlanCommandResult; events: readonly TripPlanEvent[] } {
  const at = new Date().toISOString()
  const current = withCommandDefaults(plan)
  const events: TripPlanEvent[] = []
  let next = { ...current, updatedAt: at }
  let commandErrors: CommandValidationError[] = []

  switch (command.type) {
    case "create": {
      const created = createTripPlan(
        command.route,
        { routeId: command.route.id, stages: command.stages, warnings: [] },
        command.constraints,
        at
      )
      next = withCommandDefaults({ ...created, name: command.name })
      events.push({ type: "created", at })
      break
    }
    case "rename":
      next = { ...next, name: command.name }
      break
    case "reorderStages": {
      const ids = next.stages.map((stage) => stage.id)
      const ordered = command.orderedStageIds
      const unique = new Set(ordered)
      const exactCover = ordered.length === ids.length && unique.size === ids.length && ids.every((id) => unique.has(id))
      if (!exactCover) {
        commandErrors = [commandError("orderedStageIds", "orderedStageIds must exactly cover existing stage ids without duplicates.")]
        break
      }
      const byId = new Map(next.stages.map((stage) => [stage.id, stage]))
      next = {
        ...next,
        stages: ordered.map((id) => byId.get(id)!),
        actions: [...next.actions, actionRecord(ordered[0] ?? "stages", "reorder", at, ordered)]
      }
      events.push({ type: "stage-reordered", orderedStageIds: ordered, at })
      break
    }
    case "skipStage": {
      const terminalId = next.stages.at(-1)?.id
      if (command.stageId === terminalId) {
        commandErrors = [{ code: "terminal_destination", message: "The terminal final stage cannot be skipped." }]
        break
      }
      if (!next.stages.some((stage) => stage.id === command.stageId)) {
        commandErrors = [commandError(command.stageId, `Stage ${command.stageId} was not found.`)]
        break
      }
      next = {
        ...next,
        actions: [...next.actions, actionRecord(command.stageId, "skip", at, [command.stageId], command.reason)]
      }
      events.push({ type: "stage-skipped", stageId: command.stageId, at })
      break
    }
    case "splitStage": {
      const stage = next.stages.find((candidate) => candidate.id === command.stageId)
      if (stage === undefined) {
        commandErrors = [commandError(command.stageId, `Stage ${command.stageId} was not found.`)]
        break
      }
      const [first, second] = splitStage(stage, command.at, command.newStageId)
      next = {
        ...next,
        stages: next.stages.flatMap((candidate) => candidate.id === command.stageId ? [first, second] : [candidate]),
        actions: [...next.actions, actionRecord(command.stageId, "split", at, [command.stageId, command.newStageId])]
      }
      events.push({ type: "stage-split", originalId: command.stageId, newStageId: command.newStageId, at })
      break
    }
    case "mergeStages": {
      const firstIndex = next.stages.findIndex((stage) => stage.id === command.firstStageId)
      const secondIndex = next.stages.findIndex((stage) => stage.id === command.secondStageId)
      if (firstIndex === -1 || secondIndex === -1 || secondIndex !== firstIndex + 1) {
        commandErrors = [commandError(command.secondStageId, "mergeStages requires adjacent stages in current order.")]
        break
      }
      const merged = mergeStagePair(next.stages[firstIndex]!, next.stages[secondIndex]!)
      next = {
        ...next,
        stages: next.stages.filter((_, index) => index !== secondIndex).map((stage, index) => index === firstIndex ? merged : stage),
        actions: [...next.actions, actionRecord(command.firstStageId, "merge", at, [command.firstStageId, command.secondStageId])]
      }
      events.push({ type: "stage-merged", intoStageId: command.firstStageId, absorbedStageId: command.secondStageId, at })
      break
    }
    case "extendStage":
      next = {
        ...replaceStage(next, command.stageId, (stage) => ({ ...stage, finish: command.newFinish })),
        actions: [...next.actions, actionRecord(command.stageId, "extend", at, [command.stageId])]
      }
      events.push({ type: "stage-extended", stageId: command.stageId, at })
      break
    case "setNotes":
      next = { ...next, notes: { ...next.notes, [command.stageId ?? "root"]: command.notes } }
      break
    case "setChecklistItem":
      next = {
        ...next,
        checklist: next.checklist.map((item) => item.id === command.itemId ? { ...item, completed: command.completed } : item)
      }
      break
    case "addChecklistItem":
      next = { ...next, checklist: [...next.checklist, clone(command.item)] }
      break
    case "removeChecklistItem":
      next = { ...next, checklist: next.checklist.filter((item) => item.id !== command.itemId) }
      break
    case "addAlternate":
      next = { ...next, alternates: [...next.alternates, clone(command.alternate)] }
      events.push({ type: "alternate-added", alternateId: command.alternate.id, at })
      break
    case "promoteAlternate": {
      const alternate = next.alternates.find((candidate) => candidate.id === command.alternateId)
      if (alternate === undefined) {
        commandErrors = [commandError(command.alternateId, `Alternate ${command.alternateId} was not found.`)]
        break
      }
      const previous: TripPlanAlternate = {
        id: `alternate-${crypto.randomUUID()}`,
        label: next.route.name,
        routeSnapshot: clone(next.route),
        createdAt: at,
        notes: "Previous route before alternate promotion"
      }
      next = {
        ...next,
        route: clone(alternate.routeSnapshot),
        routeId: alternate.routeSnapshot.id,
        alternates: [...next.alternates.filter((candidate) => candidate.id !== command.alternateId), previous]
      }
      events.push({ type: "alternate-promoted", alternateId: command.alternateId, at })
      break
    }
    case "setFuelEnvelope":
      next = { ...next, fuelEnvelope: clone(command.envelope) }
      break
    case "setDaylightWindow":
      next = {
        ...next,
        daylightWindows: [
          ...next.daylightWindows.filter((window) => window.date !== command.window.date),
          clone(command.window)
        ]
      }
      break
    case "addServiceStop":
      next = { ...next, serviceStops: [...next.serviceStops, clone(command.stop)] }
      break
    case "removeServiceStop":
      next = { ...next, serviceStops: next.serviceStops.filter((stop) => stop.id !== command.stopId) }
      break
    case "confirmServiceStop":
      next = {
        ...next,
        serviceStops: next.serviceStops.map((stop) => stop.id === command.stopId ? { ...stop, confirmed: true } : stop)
      }
      break
    case "snapshot": {
      const snapshot = { id: `snapshot-${crypto.randomUUID()}`, label: command.snapshotLabel, at, payload: snapshotPayload(next) }
      next = { ...next, snapshots: [...next.snapshots, snapshot] }
      events.push({ type: "snapshot-created", snapshotId: snapshot.id, label: command.snapshotLabel, at })
      break
    }
    case "restoreSnapshot": {
      const snapshot = next.snapshots.find((candidate) => candidate.id === command.snapshotId)
      if (snapshot === undefined) {
        commandErrors = [commandError(command.snapshotId, `Snapshot ${command.snapshotId} was not found.`)]
        break
      }
      next = { ...withCommandDefaults(snapshot.payload), snapshots: [] }
      events.push({ type: "snapshot-restored", snapshotId: command.snapshotId, at })
      break
    }
  }

  return { result: buildResult(next, commandErrors), events }
}
