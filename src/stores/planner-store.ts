import { create } from "zustand"
import { canTransitionPlannerPhase } from "@/lib/domain/planner-state-machine"
import { persist, createJSONStorage } from "zustand/middleware"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import { routeEntityCache, type RoutePlanSummary } from "@/lib/client/route-entity-cache"
import type { RoadLock } from "@/lib/roads/road-locks"
import { convertMustLockToPrefer } from "@/lib/roads/road-locks"
import type { TripPlan } from "@/lib/routing/planner"
import type { RouteProfileId, Waypoint } from "@/lib/routing/types"
import type { ContextSheetDetent } from "@/components/planner/workspace/context-sheet-state"
import {
  createRideHistory, defaultRideIntent, dispatchRideCommand, undoRideIntent, redoRideIntent,
  isRideIntent, type RideIntent, type RideHistory, type RideCommandSource
} from "@/lib/domain/ride-intent"
import type { PlanningResultIdentity } from "@/lib/client/trip-planning-coordinator"
import type { RideCheckpointInput } from "@/lib/storage/ride-checkpoint"

export type PlannerPointId = "start" | "finish"
export type PlannerSurface = "planner" | "library" | "ride" | "free-ride"
export type PlannerStatus = "idle" | "routing" | "ready" | "error"

/**
 * One planner lifecycle state (Phase 6). `interpreting` and `geocoding` are
 * driven by the free-text prompt flow; `routing-primary` and `alternatives`
 * by the coordinator; `ready`/`cancelled`/`error` terminate a lifecycle.
 * Transient — never persisted.
 */
export type PlanningPhase =
  | "idle"
  | "interpreting"
  | "geocoding"
  | "routing-primary"
  | "alternatives"
  | "ready"
  | "cancelled"
  | "error"

export interface PlannerError {
  code: string
  message: string
}

export interface RoutePointSnapshot {
  start: Waypoint | null
  finish: Waypoint | null
  via: Waypoint[]
}

export interface SavedPlace {
  id: string
  label: string
  lat: number
  lon: number
  createdAt: number
}

export interface SearchHistoryEntry {
  id: string
  query: string
  placeLabel?: string
  lat?: number
  lon?: number
  searchedAt: number
}

const SAVED_PLACES_LIMIT = 100
const SEARCH_HISTORY_LIMIT = 50

const ROUTE_PROFILE_IDS = new Set<RouteProfileId>([
  "quick", "balanced", "twisty", "scenic", "adventure", "gravel", "avoid-highways", "neural"
])

/**
 * Defensively validate the shape of localStorage-persisted planner state.
 * IndexedDB-backed libraries validate on read, but the persist middleware
 * previously rehydrated whatever JSON was stored without a version check,
 * so a truncated write or a stale road-lock shape could flow into routing
 * (e.g. a missing `fallbackToleranceMeters` produced `NaN` custom-model
 * polygons). Invalid entries are dropped; the store keeps its defaults.
 */
export function sanitizePersistedState(persisted: unknown): Partial<PlannerState> {
  if (typeof persisted !== "object" || persisted === null || Array.isArray(persisted)) return {}
  const state = persisted as Record<string, unknown>
  const sanitized: Partial<PlannerState> = {}
  if (Array.isArray(state.savedPlaces)) {
    sanitized.savedPlaces = (state.savedPlaces as SavedPlace[]).filter(
      (place) => place !== null && typeof place === "object"
        && typeof (place as SavedPlace).label === "string"
        && Number.isFinite((place as SavedPlace).lat)
        && Number.isFinite((place as SavedPlace).lon)
    )
  }
  if (Array.isArray(state.searchHistory)) {
    sanitized.searchHistory = (state.searchHistory as SearchHistoryEntry[]).filter(
      (entry) => entry !== null && typeof entry === "object"
        && typeof (entry as SearchHistoryEntry).query === "string"
    )
  }
  if (typeof state.profile === "string" && ROUTE_PROFILE_IDS.has(state.profile as RouteProfileId)) {
    sanitized.profile = state.profile as RouteProfileId
  }
  const bikeProfile = state.bikeProfile as Partial<BikeProfile> | null | undefined
  if (bikeProfile !== null && typeof bikeProfile === "object"
    && typeof bikeProfile.name === "string"
    && Number.isFinite(bikeProfile.fuelRangeMiles)
    && Number.isFinite(bikeProfile.reserveMiles)) {
    sanitized.bikeProfile = bikeProfile as BikeProfile
  }
  if (Array.isArray(state.roadLocks)) {
    sanitized.roadLocks = (state.roadLocks as RoadLock[]).filter(
      (lock) => lock !== null && typeof lock === "object"
        && typeof (lock as RoadLock).id === "string"
        && Number.isFinite((lock as RoadLock).fallbackToleranceMeters)
        && (lock as RoadLock).fallbackToleranceMeters >= 5
        && Array.isArray((lock as RoadLock).geometry?.coordinates)
    )
  }
  if (typeof state.curvatureVisible === "boolean") sanitized.curvatureVisible = state.curvatureVisible
  return sanitized
}

export const PLANNER_UI_STORAGE_KEY = "switchback.planner.ui.v1"
/** Pre-Wave-1 planner blob. Read-only from here on, never written or deleted. */
export const LEGACY_PLANNER_STORAGE_KEY = "switchback.planner.v1"

/**
 * Wave 1 moved ride intent out of localStorage, which meant a new persist key.
 * The rider's saved places, recent searches and curvature toggle are not ride
 * intent and must survive that move, so a first read falls back to the legacy
 * blob and adopts only those validated fields. Writes only ever touch the new
 * key: the legacy record stays intact as the rollback source.
 */
const plannerUiStorage: Storage = {
  get length() { return localStorage.length },
  key: (index) => localStorage.key(index),
  clear: () => localStorage.clear(),
  removeItem: (name) => localStorage.removeItem(name),
  setItem: (name, value) => localStorage.setItem(name, value),
  getItem: (name) => {
    const current = localStorage.getItem(name)
    if (current !== null) return current
    const legacy = localStorage.getItem(LEGACY_PLANNER_STORAGE_KEY)
    if (legacy === null) return null
    try {
      const { savedPlaces, searchHistory, curvatureVisible } =
        sanitizePersistedState((JSON.parse(legacy) as { state?: unknown }).state)
      return JSON.stringify({
        state: {
          savedPlaces: savedPlaces ?? [],
          searchHistory: searchHistory ?? [],
          curvatureVisible: curvatureVisible ?? true
        },
        version: 1
      })
    } catch {
      // A corrupt legacy blob simply means no UI index to inherit.
      return null
    }
  }
}

function invalidateRouteResult() {
  routeEntityCache.invalidate()
  return {
    plan: null,
    selectedRouteId: null,
    error: null,
    status: "idle" as const
  }
}

/** Point edits name themselves: the label is what the rider reads back when
 *  they are deciding whether to undo the change. */
function applyRoutePointEdit(state: PlannerState, points: RoutePointSnapshot, label = "Updated your route") {
  return applyIntentEdit(state, points, label)
}

/** The flat planner fields are the sole writable current intent. */
export function getRideIntent(state: RideIntent): RideIntent {
  const { start, finish, via, mode, targetMinutes, timeShaped, profile, bikeProfile,
    avoidHighways, tollPolicy, avoidAreas, roadLocks, segmentProfiles, sketchCorridor } = state
  return { start, finish, via, mode, targetMinutes, timeShaped, profile, bikeProfile,
    avoidHighways, tollPolicy, avoidAreas, roadLocks, segmentProfiles, sketchCorridor }
}

function historyOf(state: PlannerState): RideHistory {
  return { ...state.rideHistory, intent: getRideIntent(state) }
}

function projectHistory(history: RideHistory) {
  const { intent, ...rideHistory } = history
  return {
    ...intent, rideHistory,
    startQuery: intent.start?.label ?? "",
    finishQuery: intent.finish?.label ?? "",
    armedPoint: null,
    canUndoRideChange: history.past.length > 0,
    canRedoRideChange: history.future.length > 0
  }
}

/**
 * A failed update is only ever about the attempt that failed. Editing the ride
 * again supersedes it, so the stale error must go with it — while the last
 * usable route stays exactly where it is.
 */
function clearFailedUpdate(state: PlannerState) {
  if (state.status !== "error" && state.error === null) return {}
  return {
    error: null,
    status: state.plan ? "ready" as const : "idle" as const,
    planningPhase: state.planningPhase === "error" ? "idle" as const : state.planningPhase
  }
}

function applyIntentEdit(
  state: PlannerState,
  changes: Partial<RideIntent>,
  label: string,
  source: RideCommandSource = "rider",
  recordHistory = true
): Partial<PlannerState> {
  const result = dispatchRideCommand(historyOf(state), {
    type: "edit", id: generateId(), baseIdentity: state.rideHistory.identity, source, label, changes, recordHistory
  })
  if (result.outcome !== "applied") return {}
  return { ...clearFailedUpdate(state), ...projectHistory(result.state) }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface PlannerState extends RideIntent {
  /** Draft-recovery lifecycle. `superseded` means a saved draft was dropped
   *  because the rider had already started a newer ride in this tab; that is
   *  not a conflict and never blocks checkpointing. */
  recoveryStatus: "loading" | "ready" | "restored" | "superseded" | "unavailable" | "invalid" | "conflict"
  restoreRide(checkpoint: RideCheckpointInput, expectedIdentity: string): boolean
  rideHistory: Omit<RideHistory, "intent">
  getIntentIdentity(): string
  pendingResultIdentity: PlanningResultIdentity | null
  resultIdentity: PlanningResultIdentity | null
  /** The ride the currently displayed route actually answers. Never the same
   *  object as the live intent: it only moves when a result commits. */
  committedRide: RideHistory | null
  editRide(changes: Partial<RideIntent>, label: string, source?: RideCommandSource, recordHistory?: boolean): "applied" | "stale" | "invalid" | "noop"
  start: Waypoint | null
  finish: Waypoint | null
  via: Waypoint[]
  startQuery: string
  finishQuery: string
  armedPoint: PlannerPointId | null
  profile: RouteProfileId
  bikeProfile: BikeProfile
  roadLocks: RoadLock[]
  status: PlannerStatus
  plan: RoutePlanSummary | null
  selectedRouteId: string | null
  /** Who picked the current route: a user tap (never auto-replaced) or the
   *  planner's automatic choice. Late alternatives and learned re-ranking
   *  must not silently replace a user selection (SB-005). */
  selectionSource: "user" | "automatic"
  error: PlannerError | null
  curvatureVisible: boolean
  surface: PlannerSurface
  /** Phase 6: active planning lifecycle; transient. */
  planningPhase: PlanningPhase
  /** Wall-clock start of the active lifecycle; transient. */
  planningStartedAt: number | null
  /** True while a replan keeps the previous route visible but dimmed. */
  isRecalculating: boolean
  /** ContextSheet detent override; transient. `null` defers to the
   *  viewport default (peek on phones, half elsewhere). Map camera
   *  fitting reads this so insets track the visible sheet size. */
  sheetDetentOverride: ContextSheetDetent | null
  canUndoRideChange: boolean
  canRedoRideChange: boolean
  savedPlaces: SavedPlace[]
  searchHistory: SearchHistoryEntry[]
  seedCurrentLocation(point: Waypoint): void
  setPoint(id: PlannerPointId, point: Waypoint): void
  setPointQuery(id: PlannerPointId, query: string): void
  replaceRoutePoints(points: {
    start: Waypoint | null
    finish: Waypoint | null
    via: Waypoint[]
  }): void
  addVia(point: Waypoint): void
  updateVia(index: number, point: Waypoint): void
  removeVia(index: number): void
  moveVia(fromIndex: number, toIndex: number): void
  clearVia(): void
  clearRoute(): void
  reverseRoutePoints(mode: "loop" | "destination"): void
  /** Whole-ride undo/redo. One rider change — however many fields it touched
   *  — is one step, and system initialization is never a step. */
  undoRideChange(): void
  redoRideChange(): void
  armPoint(id: PlannerPointId | null): void
  setSheetDetentOverride(detent: ContextSheetDetent | null): void
  setProfile(profile: RouteProfileId): void
  setBikeProfile(profile: BikeProfile): void
  beginRouting(identity?: PlanningResultIdentity): void
  applyPlan(plan: TripPlan, identity?: PlanningResultIdentity): void
  /** Merge progressively loaded alternatives into the active plan without
   *  changing the selected primary route. */
  mergeAlternatives(plan: TripPlan, identity?: PlanningResultIdentity): void
  failRouting(error: PlannerError): void
  /** Phase 6 lifecycle control. */
  beginPlanning(): void
  setPlanningPhase(phase: PlanningPhase): void
  cancelPlanning(): void
  cancelRideUpdate(): void
  selectRoute(id: string): void
  /** Automatic selection (planner defaults, late alternatives, learned
   *  re-ranking). Never overrides an explicit user selection. */
  applyAutomaticRouteSelection(id: string): void
  setCurvatureVisible(visible: boolean): void
  setSurface(surface: PlannerSurface): void
  addRoadLock(lock: RoadLock): void
  updateRoadLock(id: string, patch: Partial<RoadLock>): void
  removeRoadLock(id: string): void
  convertRoadLock(id: string): void
  clearRoadLocks(): void
  addSavedPlace(place: Omit<SavedPlace, "id" | "createdAt">): void
  removeSavedPlace(id: string): void
  clearSavedPlaces(): void
  addSearchHistory(entry: Omit<SearchHistoryEntry, "id" | "searchedAt">): void
  clearSearchHistory(): void
}

const ACTIVE_RIDE_ID = "active-ride"

function initialRideHistory(): Omit<RideHistory, "intent"> {
  const { intent: _intent, ...history } = createRideHistory(ACTIVE_RIDE_ID)
  void _intent
  return history
}

export const initialPlannerState = {
  recoveryStatus: "loading" as PlannerState["recoveryStatus"],
  pendingResultIdentity: null as PlanningResultIdentity | null,
  resultIdentity: null as PlanningResultIdentity | null,
  committedRide: null as RideHistory | null,
  // Ride intent has exactly one set of defaults, owned by the domain module.
  ...defaultRideIntent(),
  rideHistory: initialRideHistory(),
  startQuery: "",
  finishQuery: "",
  armedPoint: null,
  status: "idle" as const,
  plan: null,
  selectedRouteId: null,
  selectionSource: "automatic" as const,
  error: null,
  planningPhase: "idle" as const,
  planningStartedAt: null,
  isRecalculating: false,
  sheetDetentOverride: null,
  curvatureVisible: true,
  surface: "planner" as const,
  canUndoRideChange: false,
  canRedoRideChange: false,
  savedPlaces: [] as SavedPlace[],
  searchHistory: [] as SearchHistoryEntry[]
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set): PlannerState => ({
      ...initialPlannerState,
      getIntentIdentity: (): string => usePlannerStore.getState().rideHistory.identity,
      /**
       * Recovery restores authored intent only. Route candidates are answers,
       * not the ride: replaying them from storage would put a possibly stale
       * answer on the map under a ride the rider may since have changed, so
       * the planner re-asks instead. The caller only wins the race while the
       * rider has not authored anything themselves — `expectedIdentity`.
       */
      restoreRide: (checkpoint, expectedIdentity) => {
        if (!isRideIntent(checkpoint.intent) || usePlannerStore.getState().rideHistory.identity !== expectedIdentity) return false
        const history: RideHistory = {
          ...createRideHistory(checkpoint.rideId),
          identity: checkpoint.identity,
          sequence: checkpoint.sequence,
          intent: structuredClone(checkpoint.intent)
        }
        set({
          ...projectHistory(history),
          recoveryStatus: "restored",
          ...invalidateRouteResult(),
          committedRide: null,
          resultIdentity: null,
          pendingResultIdentity: null,
          isRecalculating: false,
          planningPhase: "idle" as const
        })
        return true
      },
      /**
       * The one way a rider decision enters the planner. Every route-defining
       * field is written here and nowhere else, so a compound change — a new
       * destination plus a new duration plus no highways — is one revision,
       * one identity, and one Undo.
       */
      editRide: (changes, label, source = "rider", recordHistory = true) => {
        let outcome: "applied" | "stale" | "invalid" | "noop" = "noop"
        set((state) => {
          const result = dispatchRideCommand(historyOf(state), {
            type: "edit", id: generateId(), baseIdentity: state.rideHistory.identity,
            source, label, changes, recordHistory
          })
          outcome = result.outcome
          if (outcome !== "applied") return {}
          return { ...clearFailedUpdate(state), ...projectHistory(result.state) }
        })
        return outcome
      },
      /**
       * A passive location fix is initialization, not a ride change: it
       * advances the identity (fencing in-flight results) without becoming
       * the thing the rider's next Undo reverses.
       *
       * Because history is strictly linear, it is only allowed to run while
       * there is no history at all. Seeding on top of an undone change would
       * silently cut the rider's redo branch with a GPS callback they never
       * asked for. Enforced here so every call site is safe by construction.
       */
      seedCurrentLocation: (point) => {
        set((state) => state.start || state.rideHistory.past.length > 0 || state.rideHistory.future.length > 0
          ? {}
          : applyIntentEdit(state, { start: point }, "Started from your location", "location", false))
      },
      setPoint: (id, point) => set((state) => applyRoutePointEdit(state, {
        start: id === "start" ? point : state.start,
        finish: id === "finish" ? point : state.finish,
        via: state.via
      }, id === "start" ? "Set your start" : "Set your destination")),
      setPointQuery: (id, query) => set((state) => {
        // Typing is a UI draft; the committed point only moves when the rider
        // picks a resolved place. Emptying the field is the one exception:
        // it is an explicit removal, so the ride must not keep routing to a
        // destination whose name the rider just deleted.
        if (query.trim().length === 0 && (id === "start" ? state.start : state.finish)) {
          return {
            ...applyIntentEdit(state, id === "start" ? { start: null } : { finish: null },
              id === "start" ? "Cleared the ride start" : "Cleared the destination"),
            ...(id === "start" ? { startQuery: "" } : { finishQuery: "" })
          }
        }
        return id === "start" ? { startQuery: query } : { finishQuery: query }
      }),
      replaceRoutePoints: (points) => set((state) => applyRoutePointEdit(state, points)),
      addVia: (point) => set((state) => applyRoutePointEdit(state, {
        start: state.start,
        finish: state.finish,
        via: [...state.via, point]
      }, "Added a stop")),
      updateVia: (index, point) => set((state) => {
        if (index < 0 || index >= state.via.length) return {}
        return applyRoutePointEdit(state, {
          start: state.start,
          finish: state.finish,
          via: state.via.map((current, currentIndex) => currentIndex === index ? point : current)
        }, "Moved a stop")
      }),
      removeVia: (index) => set((state) => {
        if (index < 0 || index >= state.via.length) return {}
        return applyRoutePointEdit(state, {
          start: state.start,
          finish: state.finish,
          via: state.via.filter((_, currentIndex) => currentIndex !== index)
        }, "Removed a stop")
      }),
      moveVia: (fromIndex, toIndex) => set((state) => {
        if (
          fromIndex < 0 || fromIndex >= state.via.length ||
          toIndex < 0 || toIndex >= state.via.length ||
          fromIndex === toIndex
        ) return {}
        const via = [...state.via]
        const [point] = via.splice(fromIndex, 1)
        via.splice(toIndex, 0, point)
        return applyRoutePointEdit(state, { start: state.start, finish: state.finish, via }, "Reordered your stops")
      }),
      clearVia: () => set((state) => state.via.length === 0 ? {} : applyRoutePointEdit(state, {
        start: state.start,
        finish: state.finish,
        via: []
      }, "Removed your stops")),
      clearRoute: () => {
        routeEntityCache.clear()
        set((state) => ({
          ...applyIntentEdit(state, defaultRideIntent(), "Started a new ride"),
          ...invalidateRouteResult(),
          // Nothing about the previous ride survives: no committed answer to
          // restore, no pending request to accept, no explicit selection.
          committedRide: null,
          resultIdentity: null,
          pendingResultIdentity: null,
          selectionSource: "automatic" as const,
          isRecalculating: false
        }))
      },
      reverseRoutePoints: (mode) => set((state) => {
        if (mode === "destination" && (!state.start || !state.finish)) return {}
        return applyRoutePointEdit(state, {
          start: mode === "destination" ? state.finish : state.start,
          finish: mode === "destination" ? state.start : null,
          via: [...state.via].reverse()
        }, "Reversed your ride")
      }),
      undoRideChange: () => set((state) => {
        const history = historyOf(state)
        const next = undoRideIntent(history)
        return next === history ? {} : { ...clearFailedUpdate(state), ...projectHistory(next) }
      }),
      redoRideChange: () => set((state) => {
        const history = historyOf(state)
        const next = redoRideIntent(history)
        return next === history ? {} : { ...clearFailedUpdate(state), ...projectHistory(next) }
      }),
      armPoint: (armedPoint) => set({ armedPoint }),
      setSheetDetentOverride: (sheetDetentOverride) => set({ sheetDetentOverride }),
      setProfile: (profile) => {
        set((state) => applyIntentEdit(state, { profile }, "Changed road character"))
      },
      setBikeProfile: (bikeProfile) => {
        set((state) => applyIntentEdit(state, { bikeProfile }, "Changed bike preferences"))
      },
      beginRouting: (identity) => set((state) => ({
        pendingResultIdentity: identity ?? null,
        status: "routing",
        // The previous route stays on the map, dimmed, for the whole attempt —
        // and stays there if the attempt fails. A rider never loses the ride
        // they had because the next one is still being worked out.
        isRecalculating: Boolean(state.plan),
        error: null
      })),
      applyPlan: (plan, identity) => {
        const state = usePlannerStore.getState()
        if (identity && (state.rideHistory.identity !== identity.intentIdentity
          || state.pendingResultIdentity?.requestId !== identity.requestId)) return
        const summary: RoutePlanSummary = {
          ...plan,
          routes: routeEntityCache.replace(plan.routes)
        }
        set({
          resultIdentity: identity ?? null,
          pendingResultIdentity: null,
          committedRide: historyOf(state),
          plan: summary,
          selectedRouteId: plan.selectedRouteId,
          selectionSource: "automatic" as const,
          status: "ready",
          isRecalculating: false,
          error: null
        })
      },
      mergeAlternatives: (alternatives, identity) => set((state) => {
        if (identity && (state.rideHistory.identity !== identity.intentIdentity
          || state.resultIdentity?.requestId !== identity.requestId
          || state.resultIdentity?.intentIdentity !== identity.intentIdentity)) return {}
        if (!state.plan) return {}
        const existingIds = new Set(state.plan.routes.map((route) => route.id))
        const fresh = alternatives.routes.filter((route) => !existingIds.has(route.id))
        if (fresh.length === 0 && alternatives.warnings.length === 0) return {}
        const freshSummaries = routeEntityCache.merge(fresh)
        return {
          plan: {
            ...state.plan,
            routes: [...state.plan.routes, ...freshSummaries],
            warnings: Array.from(new Set([...state.plan.warnings, ...alternatives.warnings]))
          },
          status: "ready",
          isRecalculating: false,
          error: null
        }
      }),
      /**
       * A failed update changes what we can *show*, never what the rider
       * asked for. The attempted intent stays current so it can be retried or
       * cancelled, and the last usable route stays visible and selectable —
       * `committedRide` still points at the ride that route answers, so the
       * planner never claims the two are the same thing.
       */
      failRouting: (error) => set({
        pendingResultIdentity: null,
        status: "error",
        error,
        isRecalculating: false,
        planningPhase: "error" as const
      }),
      beginPlanning: () => set((state) => ({
        planningPhase: state.planningPhase === "idle" ? "routing-primary" as const : state.planningPhase,
        planningStartedAt: state.planningStartedAt ?? Date.now()
      })),
      setPlanningPhase: (planningPhase) => set((state) => {
        // Explicit state machine (SB-022): an illegal transition is ignored
        // so no combination of unrelated booleans can fake a lifecycle state.
        if (!canTransitionPlannerPhase(state.planningPhase, planningPhase)) return {}
        return {
          planningPhase,
          planningStartedAt: planningPhase === "ready" || planningPhase === "cancelled" || planningPhase === "error"
            ? null
            : state.planningStartedAt ?? Date.now()
        }
      }),
      /**
       * Cancelling nothing is not a cancellation. The request gate invalidates
       * on every ordinary edit — and React remounts the planner once in
       * development — so unconditionally reporting "cancelled" left an idle
       * planner permanently claiming a lifecycle had been aborted. Anything
       * reading the phase to mean "a rider action is in progress" (the passive
       * location seed) then backed off forever.
       */
      cancelPlanning: () => set((state) => {
        const inFlight = state.planningPhase === "interpreting" || state.planningPhase === "geocoding"
          || state.planningPhase === "routing-primary" || state.planningPhase === "alternatives"
          || state.status === "routing" || state.pendingResultIdentity !== null
          || state.planningStartedAt !== null
        if (!inFlight) return { pendingResultIdentity: null, isRecalculating: false }
        return {
          pendingResultIdentity: null,
          planningPhase: "cancelled" as const,
          planningStartedAt: null,
          isRecalculating: false,
          status: state.plan ? "ready" as const : "idle" as const
        }
      }),
      /**
       * Cancel means exactly one thing: "drop the change I am in the middle
       * of and put my last usable ride back". It restores the committed
       * intent as one undoable revision (so a mis-tap is recoverable), clears
       * the failed-update state, and leaves the displayed route untouched —
       * aborting the in-flight request is the session controller's half of
       * the same command.
       */
      cancelRideUpdate: () => set((state) => {
        const committed = state.committedRide
        // The lifecycle phase stays owned by cancelPlanning, which the session
        // controller calls as the other half of this command.
        const settled = {
          error: null,
          status: state.plan ? "ready" as const : "idle" as const,
          isRecalculating: false,
          pendingResultIdentity: null
        }
        if (!committed || committed.identity === state.rideHistory.identity) return settled
        const restored = applyIntentEdit(state, committed.intent, "Cancelled ride change")
        if (Object.keys(restored).length === 0) {
          // The live intent already equals the route's intent (for example,
          // undo then redo back to the committed ride). Adopt the current
          // revision so identity-based readiness cannot remain stale.
          return { ...settled, committedRide: historyOf(state) }
        }
        // Restoring a committed intent is deliberately a *new* linear-history
        // revision so Undo can recover the cancelled edit and old async results
        // remain fenced out. The retained route answers the restored intent,
        // so atomically adopt that new revision as the route's committed ride.
        const restoredState = { ...state, ...restored } as PlannerState
        return {
          ...restored,
          ...settled,
          committedRide: historyOf(restoredState)
        }
      }),
      selectRoute: (selectedRouteId) => set({ selectedRouteId, selectionSource: "user" as const }),
      // Automatic selection must never replace an explicit user pick (SB-005);
      // enforced here so every call site is safe by construction.
      applyAutomaticRouteSelection: (selectedRouteId) => set((state) =>
        state.selectionSource === "user" ? {} : { selectedRouteId, selectionSource: "automatic" as const }),
      setCurvatureVisible: (curvatureVisible) => set({ curvatureVisible }),
      setSurface: (surface) => set({ surface }),
      addSavedPlace: (place) => set((state) => {
        const exists = state.savedPlaces.some(
          (p) => p.lat === place.lat && p.lon === place.lon
        )
        if (exists) return {}
        const savedPlace: SavedPlace = {
          ...place,
          id: generateId(),
          createdAt: Date.now()
        }
        return {
          savedPlaces: [savedPlace, ...state.savedPlaces].slice(0, SAVED_PLACES_LIMIT)
        }
      }),
      removeSavedPlace: (id) => set((state) => ({
        savedPlaces: state.savedPlaces.filter((p) => p.id !== id)
      })),
      clearSavedPlaces: () => set({ savedPlaces: [] }),
      addSearchHistory: (entry) => set((state) => {
        const searchEntry: SearchHistoryEntry = {
          ...entry,
          id: generateId(),
          searchedAt: Date.now()
        }
        const existing = state.searchHistory.filter(
          (e) => e.query.toLowerCase() !== entry.query.toLowerCase()
        )
        return {
          searchHistory: [searchEntry, ...existing].slice(0, SEARCH_HISTORY_LIMIT)
        }
      }),
      clearSearchHistory: () => set({ searchHistory: [] }),
      addRoadLock: (lock) => set((state) => {
        const existing = state.roadLocks.some((existingLock) => existingLock.id === lock.id)
        if (existing) return {}
        return applyIntentEdit(state, { roadLocks: [...state.roadLocks, lock] }, "Kept a road")
      }),
      updateRoadLock: (id, patch) => set((state) => {
        const index = state.roadLocks.findIndex((lock) => lock.id === id)
        if (index < 0) return {}
        const current = state.roadLocks[index]!
        const next: RoadLock = { ...current, ...patch, id: current.id }
        if (
          next.mode === current.mode &&
          next.displayName === current.displayName &&
          next.edgeIds === current.edgeIds &&
          next.orderedAnchors === current.orderedAnchors &&
          next.fallbackToleranceMeters === current.fallbackToleranceMeters
        ) return {}
        const roadLocks = state.roadLocks.map((lock) => lock.id === id ? next : lock)
        return applyIntentEdit(state, { roadLocks }, "Changed a kept road")
      }),
      removeRoadLock: (id) => set((state) => {
        if (!state.roadLocks.some((lock) => lock.id === id)) return {}
        return applyIntentEdit(state, { roadLocks: state.roadLocks.filter((lock) => lock.id !== id) }, "Removed a kept road")
      }),
      convertRoadLock: (id) => set((state) => {
        const index = state.roadLocks.findIndex((lock) => lock.id === id)
        if (index < 0) return {}
        const current = state.roadLocks[index]!
        if (current.mode !== "must") return {}
        const next = convertMustLockToPrefer(current)
        const roadLocks = state.roadLocks.map((lock) => lock.id === id ? next : lock)
        return applyIntentEdit(state, { roadLocks }, "Changed road to preferred")
      }),
      clearRoadLocks: () => {
        set((state) => applyIntentEdit(state, { roadLocks: [] }, "Removed kept roads"))
      }
    }),
    {
      // Only the UI index lives here now; active ride intent belongs to the
      // ride checkpoint. The legacy key keeps its intent fragments untouched
      // so a rollback still finds them.
      name: PLANNER_UI_STORAGE_KEY,
      storage: createJSONStorage(() => plannerUiStorage),
      version: 1,
      migrate: (persisted) => sanitizePersistedState(persisted),
      partialize: (state) => ({
        savedPlaces: state.savedPlaces,
        searchHistory: state.searchHistory,
        curvatureVisible: state.curvatureVisible
      })
    }
  )
)
