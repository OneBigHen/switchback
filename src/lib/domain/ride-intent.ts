import type { BikeProfile } from "@/lib/routing/bike-profiles"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import type { AvoidArea, Coordinate, GravelAtlasPreference, RouteProfileId, TollPolicy, Waypoint } from "@/lib/routing/types"
import type { RoadLock } from "@/lib/roads/road-locks"

/** Authored inputs only. A missing destination is valid, including before routing. */
export interface RideIntent {
  start: Waypoint | null
  finish: Waypoint | null
  via: Waypoint[]
  mode: "destination" | "loop"
  targetMinutes: number
  timeShaped: boolean
  profile: RouteProfileId
  bikeProfile: BikeProfile
  avoidHighways: boolean
  tollPolicy: TollPolicy
  gravelAtlas: GravelAtlasPreference
  avoidAreas: AvoidArea[]
  roadLocks: RoadLock[]
  segmentProfiles: RouteProfileId[]
  sketchCorridor: Coordinate[] | null
}

export type RideCommandSource = "rider" | "advisor" | "drawing" | "import" | "location" | "settings"
export interface RideCommand {
  type: "edit"
  id: string
  baseIdentity: string
  source: RideCommandSource
  label: string
  /** An explicit compound authored edit, never arbitrary store/UI properties. */
  changes: Partial<RideIntent>
  /**
   * System initialization — recovered defaults, a passive GPS seed — still
   * advances the identity so in-flight results are fenced, but is not a ride
   * change the rider made and must never appear under Undo. Default `true`:
   * anything a rider can point at is undoable.
   *
   * It does **not** exempt the command from linear history. A system edit that
   * actually changes the intent has diverged from any undone branch and cuts
   * redo like any other change, so callers must run only while there is no
   * history to diverge from.
   */
  recordHistory?: boolean
}
export interface RideRevision {
  commandId: string
  source: RideCommandSource | "undo" | "redo"
  label: string
  previousIdentity: string
  resultingIdentity: string
  changedFields: Array<keyof RideIntent>
  undoable: boolean
}
interface HistoryEntry { intent: RideIntent; change: RideRevision }
export interface RideHistory {
  rideId: string
  identity: string
  sequence: number
  intent: RideIntent
  past: HistoryEntry[]
  future: HistoryEntry[]
  lastChange: RideRevision | null
}
export const RIDE_HISTORY_LIMIT = 50

/** The one source of ride-intent defaults. The planner store spreads this
 *  rather than repeating a second, silently divergent set of defaults. */
export function defaultRideIntent(): RideIntent {
  return {
    start: null, finish: null, via: [], mode: "destination", targetMinutes: 120,
    timeShaped: false, profile: "balanced", bikeProfile: { ...MOTORCYCLE_PROFILES[0]! },
    avoidHighways: false, tollPolicy: "allow-with-warning",
    gravelAtlas: { enabled: false, intensity: "balanced" }, avoidAreas: [],
    roadLocks: [], segmentProfiles: [], sketchCorridor: null
  }
}

export function createRideHistory(rideId: string): RideHistory {
  return {
    rideId, identity: `${rideId}:0`, sequence: 0, past: [], future: [], lastChange: null,
    intent: defaultRideIntent()
  }
}

function changedFields(before: RideIntent, after: RideIntent): Array<keyof RideIntent> {
  return (Object.keys(before) as Array<keyof RideIntent>)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
}

function change(state: RideHistory, intent: RideIntent, source: RideRevision["source"], label: string, commandId: string, undoable = true): RideRevision {
  return {
    commandId, source, label, previousIdentity: state.identity,
    resultingIdentity: `${state.rideId}:${state.sequence + 1}:${commandId}`,
    changedFields: changedFields(state.intent, intent), undoable
  }
}

export function dispatchRideCommand(state: RideHistory, command: RideCommand): {
  state: RideHistory; outcome: "applied" | "stale" | "invalid" | "noop"
} {
  if (command.baseIdentity !== state.identity) return { state, outcome: "stale" }
  if (!command.id || !command.label || command.type !== "edit"
    || !["rider", "advisor", "drawing", "import", "location", "settings"].includes(command.source)) return { state, outcome: "invalid" }
  // Detach caller-owned data once. Unchanged immutable fields remain shared in
  // history; route candidate geometry never enters this module.
  const changes = structuredClone(command.changes)
  for (const key of Object.keys(changes) as Array<keyof RideIntent>) {
    if (JSON.stringify(changes[key]) === JSON.stringify(state.intent[key])) delete changes[key]
  }
  const intent = { ...state.intent, ...changes }
  if (!isRideIntent(intent)) return { state, outcome: "invalid" }
  const recordHistory = command.recordHistory !== false
  const revision = change(state, intent, command.source, command.label, command.id, recordHistory)
  if (!revision.changedFields.length) return { state, outcome: "noop" }
  return {
    outcome: "applied",
    state: {
      ...state, intent, identity: revision.resultingIdentity, sequence: state.sequence + 1,
      // A system edit still fences in-flight results and leaves the rider's
      // undo stack exactly as they left it — but history stays strictly
      // linear. Any command that actually changed the intent has diverged
      // from the redo branch, so redo is cut regardless of who made it.
      // A no-op never reaches here, so it cannot cut anything.
      past: recordHistory
        ? [...state.past, { intent: state.intent, change: revision }].slice(-RIDE_HISTORY_LIMIT)
        : state.past,
      future: [],
      lastChange: revision
    }
  }
}

export function undoRideIntent(state: RideHistory): RideHistory {
  const previous = state.past.at(-1)
  if (!previous) return state
  const revision = change(state, previous.intent, "undo", previous.change.label, `undo-${state.sequence + 1}`)
  return {
    ...state, intent: previous.intent, identity: revision.resultingIdentity,
    sequence: state.sequence + 1, past: state.past.slice(0, -1),
    future: [{ intent: state.intent, change: previous.change }, ...state.future].slice(0, RIDE_HISTORY_LIMIT),
    lastChange: revision
  }
}

export function redoRideIntent(state: RideHistory): RideHistory {
  const next = state.future[0]
  if (!next) return state
  const revision = change(state, next.intent, "redo", next.change.label, `redo-${state.sequence + 1}`)
  return {
    ...state, intent: next.intent, identity: revision.resultingIdentity,
    sequence: state.sequence + 1,
    past: [...state.past, { intent: state.intent, change: next.change }].slice(-RIDE_HISTORY_LIMIT),
    future: state.future.slice(1), lastChange: revision
  }
}

const profiles = new Set(["quick", "balanced", "twisty", "scenic", "adventure", "gravel", "avoid-highways", "neural"])
const gravelAtlasIntensities = new Set(["balanced", "more", "maximum"])
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const coordinate = (value: unknown): boolean => Array.isArray(value) && value.length === 2
  && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180
  && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90
const point = (value: unknown): boolean => value === null || (record(value)
  && typeof value.lat === "number" && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90
  && typeof value.lon === "number" && Number.isFinite(value.lon) && Math.abs(value.lon) <= 180
  && (value.label === undefined || typeof value.label === "string"))

/** Full boundary validation; parsing JSON alone is never recovery. */
export function isRideIntent(value: unknown): value is RideIntent {
  if (!record(value)) return false
  const fields = ["start", "finish", "via", "mode", "targetMinutes", "timeShaped", "profile", "bikeProfile",
    "avoidHighways", "tollPolicy", "gravelAtlas", "avoidAreas", "roadLocks", "segmentProfiles", "sketchCorridor"]
  if (Object.keys(value).some((key) => !fields.includes(key))) return false
  const bike = value.bikeProfile
  const gravelAtlas = value.gravelAtlas
  return point(value.start) && point(value.finish)
    && Array.isArray(value.via) && value.via.length <= 100 && value.via.every((item) => item !== null && point(item))
    && (value.mode === "destination" || value.mode === "loop")
    && typeof value.targetMinutes === "number" && Number.isFinite(value.targetMinutes) && value.targetMinutes > 0 && value.targetMinutes <= 10080
    && typeof value.timeShaped === "boolean" && profiles.has(value.profile as string)
    && typeof value.avoidHighways === "boolean" && (value.tollPolicy === "avoid" || value.tollPolicy === "allow-with-warning")
    && record(gravelAtlas) && typeof gravelAtlas.enabled === "boolean"
    && typeof gravelAtlas.intensity === "string" && gravelAtlasIntensities.has(gravelAtlas.intensity)
    && record(bike) && typeof bike.name === "string"
    && ["street", "touring", "adventure", "dual-sport"].includes(bike.category as string)
    && typeof bike.fuelRangeMiles === "number" && Number.isFinite(bike.fuelRangeMiles) && bike.fuelRangeMiles > 0
    && typeof bike.reserveMiles === "number" && Number.isFinite(bike.reserveMiles) && bike.reserveMiles >= 0
    && typeof bike.allowMaintainedGravel === "boolean" && typeof bike.allowRoughTracks === "boolean" && typeof bike.avoidUnknownSurface === "boolean"
    && Array.isArray(value.avoidAreas) && value.avoidAreas.length <= 100
    && value.avoidAreas.every((area) => record(area) && typeof area.id === "string" && area.id.length > 0
      && Array.isArray(area.polygon) && area.polygon.length >= 4 && area.polygon.length <= 10000 && area.polygon.every(coordinate))
    && Array.isArray(value.roadLocks) && value.roadLocks.length <= 100
    && value.roadLocks.every((lock) => record(lock) && typeof lock.id === "string" && (lock.mode === "must" || lock.mode === "prefer")
      && Array.isArray(lock.edgeIds) && lock.edgeIds.every((id) => typeof id === "string")
      && record(lock.geometry) && lock.geometry.type === "LineString" && Array.isArray(lock.geometry.coordinates)
      && lock.geometry.coordinates.length >= 2 && lock.geometry.coordinates.length <= 50000 && lock.geometry.coordinates.every(coordinate)
      && Array.isArray(lock.orderedAnchors) && lock.orderedAnchors.every(coordinate)
      && typeof lock.fallbackToleranceMeters === "number" && Number.isFinite(lock.fallbackToleranceMeters) && lock.fallbackToleranceMeters >= 5
      && typeof lock.sourceRegionId === "string" && typeof lock.sourceGraphVersion === "string" && record(lock.accessSnapshot)
      && Array.isArray(lock.accessSnapshot.activeConditions)
      && lock.accessSnapshot.activeConditions.every((condition) => record(condition) && typeof condition.isOpen === "boolean"
        && typeof condition.sourceKey === "string" && typeof condition.raw === "string" && typeof condition.reason === "string")
      && typeof lock.accessSnapshot.routable === "boolean" && typeof lock.accessSnapshot.seasonalUndated === "boolean"
      && ["highwayClass", "motorcycleAccess", "generalAccess", "surface", "smoothness", "tracktype"].every((key) => typeof (lock.accessSnapshot as Record<string, unknown>)[key] === "string")
      && typeof lock.createdAt === "string" && ["manual", "gpx", "image-trace", "rematched"].includes(lock.source as string)
      && ["exact", "matched", "approximate"].includes(lock.confidence as string))
    && Array.isArray(value.segmentProfiles) && value.segmentProfiles.length <= 101 && value.segmentProfiles.every((item) => profiles.has(item))
    && (value.sketchCorridor === null || (Array.isArray(value.sketchCorridor) && value.sketchCorridor.length <= 50000 && value.sketchCorridor.every(coordinate)))
}

/**
 * Upgrade persisted authored intent at the storage boundary, then apply the
 * same strict validator used for current writes. Gravel Atlas is additive and
 * defaults off, so a pre-feature v1 draft remains the exact ride the rider
 * authored while gaining the new field. Unknown/corrupt shapes still fail
 * closed instead of being papered over by defaults.
 */
export function migrateRideIntent(value: unknown): RideIntent | null {
  if (!record(value)) return null
  const candidate = Object.prototype.hasOwnProperty.call(value, "gravelAtlas")
    ? structuredClone(value)
    : { ...structuredClone(value), gravelAtlas: { enabled: false, intensity: "balanced" } }
  return isRideIntent(candidate) ? candidate : null
}
