import { create } from "zustand"
import { canTransitionPlannerPhase } from "@/lib/domain/planner-state-machine"
import { persist, createJSONStorage } from "zustand/middleware"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import type { RoadLock } from "@/lib/roads/road-locks"
import { convertMustLockToPrefer } from "@/lib/roads/road-locks"
import type { TripPlan } from "@/lib/routing/planner"
import type { RouteProfileId, Waypoint } from "@/lib/routing/types"

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

const DEFAULT_BIKE_PROFILE: BikeProfile =
  MOTORCYCLE_PROFILES[0] ?? {
    name: "Street",
    category: "street",
    fuelRangeMiles: 180,
    reserveMiles: 35,
    allowMaintainedGravel: false,
    allowRoughTracks: false,
    avoidUnknownSurface: true
  }

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
const ROUTE_POINT_HISTORY_LIMIT = 50

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
function sanitizePersistedState(persisted: unknown): Partial<PlannerState> {
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

function cloneWaypoint(point: Waypoint | null): Waypoint | null {
  return point ? { ...point } : null
}

function routePointSnapshot(state: Pick<PlannerState, "start" | "finish" | "via">): RoutePointSnapshot {
  return {
    start: cloneWaypoint(state.start),
    finish: cloneWaypoint(state.finish),
    via: state.via.map((point) => ({ ...point }))
  }
}

function invalidateRouteResult() {
  return {
    plan: null,
    selectedRouteId: null,
    error: null,
    status: "idle" as const
  }
}

function applyRoutePointEdit(state: PlannerState, points: RoutePointSnapshot) {
  const routePointPast = [...state.routePointPast, routePointSnapshot(state)]
    .slice(-ROUTE_POINT_HISTORY_LIMIT)
  return {
    start: cloneWaypoint(points.start),
    finish: cloneWaypoint(points.finish),
    via: points.via.map((point) => ({ ...point })),
    startQuery: points.start?.label ?? "",
    finishQuery: points.finish?.label ?? "",
    armedPoint: null,
    routePointPast,
    routePointFuture: [],
    canUndoRoutePoints: true,
    canRedoRoutePoints: false,
    ...invalidateRouteResult()
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface PlannerState {
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
  plan: TripPlan | null
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
  routePointPast: RoutePointSnapshot[]
  routePointFuture: RoutePointSnapshot[]
  canUndoRoutePoints: boolean
  canRedoRoutePoints: boolean
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
  undoRoutePoints(): void
  redoRoutePoints(): void
  armPoint(id: PlannerPointId | null): void
  setProfile(profile: RouteProfileId): void
  setBikeProfile(profile: BikeProfile): void
  beginRouting(): void
  applyPlan(plan: TripPlan): void
  /** Merge progressively loaded alternatives into the active plan without
   *  changing the selected primary route. */
  mergeAlternatives(plan: TripPlan): void
  failRouting(error: PlannerError): void
  /** Phase 6 lifecycle control. */
  beginPlanning(): void
  setPlanningPhase(phase: PlanningPhase): void
  cancelPlanning(): void
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

export const initialPlannerState = {
  start: null,
  finish: null,
  via: [],
  startQuery: "",
  finishQuery: "",
  armedPoint: null,
  profile: "twisty" as const,
  bikeProfile: DEFAULT_BIKE_PROFILE,
  roadLocks: [] as RoadLock[],
  status: "idle" as const,
  plan: null,
  selectedRouteId: null,
  selectionSource: "automatic" as const,
  error: null,
  planningPhase: "idle" as const,
  planningStartedAt: null,
  isRecalculating: false,
  curvatureVisible: true,
  surface: "planner" as const,
  routePointPast: [] as RoutePointSnapshot[],
  routePointFuture: [] as RoutePointSnapshot[],
  canUndoRoutePoints: false,
  canRedoRoutePoints: false,
  savedPlaces: [] as SavedPlace[],
  searchHistory: [] as SearchHistoryEntry[]
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      ...initialPlannerState,
      seedCurrentLocation: (point) => set({
        start: cloneWaypoint(point),
        startQuery: point.label,
        plan: null,
        selectedRouteId: null,
        selectionSource: "automatic" as const,
        error: null,
        status: "idle"
      }),
      setPoint: (id, point) => set((state) => applyRoutePointEdit(state, {
        start: id === "start" ? point : state.start,
        finish: id === "finish" ? point : state.finish,
        via: state.via
      })),
      setPointQuery: (id, query) => set(id === "start" ? {
        start: null,
        startQuery: query,
        plan: null,
        selectedRouteId: null,
        selectionSource: "automatic" as const,
        error: null,
        status: "idle"
      } : {
        finish: null,
        finishQuery: query,
        plan: null,
        selectedRouteId: null,
        selectionSource: "automatic" as const,
        error: null,
        status: "idle"
      }),
      replaceRoutePoints: (points) => set((state) => applyRoutePointEdit(state, points)),
      addVia: (point) => set((state) => applyRoutePointEdit(state, {
        start: state.start,
        finish: state.finish,
        via: [...state.via, point]
      })),
      updateVia: (index, point) => set((state) => {
        if (index < 0 || index >= state.via.length) return {}
        return applyRoutePointEdit(state, {
          start: state.start,
          finish: state.finish,
          via: state.via.map((current, currentIndex) => currentIndex === index ? point : current)
        })
      }),
      removeVia: (index) => set((state) => {
        if (index < 0 || index >= state.via.length) return {}
        return applyRoutePointEdit(state, {
          start: state.start,
          finish: state.finish,
          via: state.via.filter((_, currentIndex) => currentIndex !== index)
        })
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
        return applyRoutePointEdit(state, { start: state.start, finish: state.finish, via })
      }),
      clearVia: () => set((state) => state.via.length === 0 ? {} : applyRoutePointEdit(state, {
        start: state.start,
        finish: state.finish,
        via: []
      })),
      clearRoute: () => set({
        start: null,
        finish: null,
        via: [],
        startQuery: "",
        finishQuery: "",
        armedPoint: null,
        routePointPast: [],
        routePointFuture: [],
        canUndoRoutePoints: false,
        canRedoRoutePoints: false,
        ...invalidateRouteResult()
      }),
      reverseRoutePoints: (mode) => set((state) => {
        if (mode === "destination" && (!state.start || !state.finish)) return {}
        return applyRoutePointEdit(state, {
          start: mode === "destination" ? state.finish : state.start,
          finish: mode === "destination" ? state.start : null,
          via: [...state.via].reverse()
        })
      }),
      undoRoutePoints: () => set((state) => {
        const previous = state.routePointPast.at(-1)
        if (!previous) return {}
        const routePointFuture = [routePointSnapshot(state), ...state.routePointFuture]
          .slice(0, ROUTE_POINT_HISTORY_LIMIT)
        const routePointPast = state.routePointPast.slice(0, -1)
        return {
          start: cloneWaypoint(previous.start),
          finish: cloneWaypoint(previous.finish),
          via: previous.via.map((point) => ({ ...point })),
          startQuery: previous.start?.label ?? "",
          finishQuery: previous.finish?.label ?? "",
          armedPoint: null,
          routePointPast,
          routePointFuture,
          canUndoRoutePoints: routePointPast.length > 0,
          canRedoRoutePoints: true,
          ...invalidateRouteResult()
        }
      }),
      redoRoutePoints: () => set((state) => {
        const next = state.routePointFuture[0]
        if (!next) return {}
        const routePointPast = [...state.routePointPast, routePointSnapshot(state)]
          .slice(-ROUTE_POINT_HISTORY_LIMIT)
        const routePointFuture = state.routePointFuture.slice(1)
        return {
          start: cloneWaypoint(next.start),
          finish: cloneWaypoint(next.finish),
          via: next.via.map((point) => ({ ...point })),
          startQuery: next.start?.label ?? "",
          finishQuery: next.finish?.label ?? "",
          armedPoint: null,
          routePointPast,
          routePointFuture,
          canUndoRoutePoints: true,
          canRedoRoutePoints: routePointFuture.length > 0,
          ...invalidateRouteResult()
        }
      }),
      armPoint: (armedPoint) => set({ armedPoint }),
      setProfile: (profile) => set((state) => state.profile === profile ? {} : {
        profile,
        plan: null,
        selectedRouteId: null,
        status: "idle",
        error: null
      }),
      setBikeProfile: (bikeProfile) => set((state) => {
        if (
          state.bikeProfile.name === bikeProfile.name &&
          state.bikeProfile.category === bikeProfile.category &&
          state.bikeProfile.fuelRangeMiles === bikeProfile.fuelRangeMiles &&
          state.bikeProfile.reserveMiles === bikeProfile.reserveMiles &&
          state.bikeProfile.allowMaintainedGravel === bikeProfile.allowMaintainedGravel &&
          state.bikeProfile.allowRoughTracks === bikeProfile.allowRoughTracks &&
          state.bikeProfile.avoidUnknownSurface === bikeProfile.avoidUnknownSurface
        ) return {}
        return {
          bikeProfile,
          plan: null,
          selectedRouteId: null,
          status: "idle",
          error: null
        }
      }),
      beginRouting: () => set((state) => ({
        status: "routing",
        // Phase 6: keep the previous route visible (dimmed) while replanning
        // instead of clearing the map; restored automatically on failure.
        isRecalculating: Boolean(state.plan),
        error: null
      })),
      applyPlan: (plan) => set({
        plan,
        selectedRouteId: plan.selectedRouteId,
        selectionSource: "automatic" as const,
        status: "ready",
        isRecalculating: false,
        error: null
      }),
      mergeAlternatives: (alternatives) => set((state) => {
        if (!state.plan) return {}
        const existingIds = new Set(state.plan.routes.map((route) => route.id))
        const fresh = alternatives.routes.filter((route) => !existingIds.has(route.id))
        if (fresh.length === 0 && alternatives.warnings.length === 0) return {}
        return {
          plan: {
            ...state.plan,
            routes: [...state.plan.routes, ...fresh],
            warnings: Array.from(new Set([...state.plan.warnings, ...alternatives.warnings]))
          },
          status: "ready",
          isRecalculating: false,
          error: null
        }
      }),
      failRouting: (error) => set({
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
      cancelPlanning: () => set({
        planningPhase: "cancelled" as const,
        planningStartedAt: null,
        isRecalculating: false,
        status: "idle"
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
        return {
          roadLocks: [...state.roadLocks, lock],
          plan: null,
          selectedRouteId: null,
          status: "idle",
          error: null
        }
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
        return { roadLocks, plan: null, selectedRouteId: null, status: "idle", error: null }
      }),
      removeRoadLock: (id) => set((state) => {
        if (!state.roadLocks.some((lock) => lock.id === id)) return {}
        return {
          roadLocks: state.roadLocks.filter((lock) => lock.id !== id),
          plan: null,
          selectedRouteId: null,
          status: "idle",
          error: null
        }
      }),
      convertRoadLock: (id) => set((state) => {
        const index = state.roadLocks.findIndex((lock) => lock.id === id)
        if (index < 0) return {}
        const current = state.roadLocks[index]!
        if (current.mode !== "must") return {}
        const next = convertMustLockToPrefer(current)
        const roadLocks = state.roadLocks.map((lock) => lock.id === id ? next : lock)
        return { roadLocks, plan: null, selectedRouteId: null, status: "idle", error: null }
      }),
      clearRoadLocks: () => set((state) => state.roadLocks.length === 0 ? {} : {
        roadLocks: [],
        plan: null,
        selectedRouteId: null,
        status: "idle",
        error: null
      })
    }),
    {
      name: "switchback.planner.v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persisted) => sanitizePersistedState(persisted),
      partialize: (state) => ({
        savedPlaces: state.savedPlaces,
        searchHistory: state.searchHistory,
        profile: state.profile,
        bikeProfile: state.bikeProfile,
        roadLocks: state.roadLocks,
        curvatureVisible: state.curvatureVisible
      })
    }
  )
)
