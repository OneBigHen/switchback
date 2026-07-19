import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { TripPlan } from "@/lib/routing/planner"
import type { RouteProfileId, Waypoint } from "@/lib/routing/types"

export type PlannerPointId = "start" | "finish"
export type PlannerSurface = "planner" | "library" | "ride"
export type PlannerStatus = "idle" | "routing" | "ready" | "error"

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
  status: PlannerStatus
  plan: TripPlan | null
  selectedRouteId: string | null
  error: PlannerError | null
  curvatureVisible: boolean
  surface: PlannerSurface
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
  beginRouting(): void
  applyPlan(plan: TripPlan): void
  failRouting(error: PlannerError): void
  selectRoute(id: string): void
  setCurvatureVisible(visible: boolean): void
  setSurface(surface: PlannerSurface): void
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
  status: "idle" as const,
  plan: null,
  selectedRouteId: null,
  error: null,
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
        error: null,
        status: "idle"
      } : {
        finish: null,
        finishQuery: query,
        plan: null,
        selectedRouteId: null,
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
      beginRouting: () => set({
        status: "routing",
        plan: null,
        selectedRouteId: null,
        error: null
      }),
      applyPlan: (plan) => set({
        plan,
        selectedRouteId: plan.selectedRouteId,
        status: "ready",
        error: null
      }),
      failRouting: (error) => set({ status: "error", error }),
      selectRoute: (selectedRouteId) => set({ selectedRouteId }),
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
      clearSearchHistory: () => set({ searchHistory: [] })
    }),
    {
      name: "switchback.planner.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        savedPlaces: state.savedPlaces,
        searchHistory: state.searchHistory,
        profile: state.profile,
        curvatureVisible: state.curvatureVisible
      })
    }
  )
)
