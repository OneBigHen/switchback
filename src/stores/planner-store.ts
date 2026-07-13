import { create } from "zustand"
import type { TripPlan } from "@/lib/routing/planner"
import type { RouteProfileId, Waypoint } from "@/lib/routing/types"

export type PlannerPointId = "start" | "finish"
export type PlannerSurface = "planner" | "library" | "ride"
export type PlannerStatus = "idle" | "routing" | "ready" | "error"

export interface PlannerError {
  code: string
  message: string
}

interface PlannerState {
  start: Waypoint | null
  finish: Waypoint | null
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
  setPoint(id: PlannerPointId, point: Waypoint): void
  setPointQuery(id: PlannerPointId, query: string): void
  armPoint(id: PlannerPointId | null): void
  setProfile(profile: RouteProfileId): void
  beginRouting(): void
  applyPlan(plan: TripPlan): void
  failRouting(error: PlannerError): void
  selectRoute(id: string): void
  setCurvatureVisible(visible: boolean): void
  setSurface(surface: PlannerSurface): void
}

export const initialPlannerState = {
  start: {
    lat: 40.2732,
    lon: -76.8867,
    label: "Harrisburg, Pennsylvania"
  },
  finish: {
    lat: 39.8309,
    lon: -77.2311,
    label: "Gettysburg, Pennsylvania"
  },
  startQuery: "Harrisburg, Pennsylvania",
  finishQuery: "Gettysburg, Pennsylvania",
  armedPoint: null,
  profile: "twisty" as const,
  status: "idle" as const,
  plan: null,
  selectedRouteId: null,
  error: null,
  curvatureVisible: true,
  surface: "planner" as const
}

export const usePlannerStore = create<PlannerState>((set) => ({
  ...initialPlannerState,
  setPoint: (id, point) => set(id === "start" ? {
    start: point,
    startQuery: point.label ?? "Selected start",
    armedPoint: null,
    plan: null,
    selectedRouteId: null,
    error: null,
    status: "idle"
  } : {
    finish: point,
    finishQuery: point.label ?? "Selected finish",
    armedPoint: null,
    plan: null,
    selectedRouteId: null,
    error: null,
    status: "idle"
  }),
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
  setSurface: (surface) => set({ surface })
}))
