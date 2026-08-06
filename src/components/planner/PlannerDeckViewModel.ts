import type { PlaceIdeasResult } from "@/lib/client/place-ideas-client"
import type { TripPlan } from "@/lib/routing/planner"
import type { RideResearchSource } from "@/lib/ai/ride-research"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import type { RoadLock } from "@/lib/roads/road-locks"
import type { PlannedRoute, RouteProfileId, Waypoint } from "@/lib/routing/types"
import type { PlannerError, PlannerPointId, PlannerStatus, PlanningPhase } from "@/stores/planner-store"

export type PlanMode = "destination" | "loop"
export type RideIntentStatus = "idle" | "interpreting"

export interface PlannerWaypointViewModel {
  start: Waypoint | null
  finish: Waypoint | null
  startQuery: string
  finishQuery: string
  armedPoint: PlannerPointId | null
  via: Waypoint[]
  addingVia: boolean
  canUndoRoutePoints: boolean
  canRedoRoutePoints: boolean
}

export interface PlannerRideConfigViewModel {
  planMode: PlanMode
  targetMinutes: number
  profile: RouteProfileId
  bikeProfile: BikeProfile
  roadLocks: RoadLock[]
  curvatureVisible: boolean
  avoidHighways: boolean
  segmentProfiles: RouteProfileId[]
  avoidAreaCount: number
}

export interface PlannerIntentViewModel {
  intentStatus: RideIntentStatus
  intentSummary: string | null
  stopIdeas: PlaceIdeasResult | null
  researchStatus: "idle" | "researching"
  researchSources: RideResearchSource[]
}

export interface PlannerUiViewModel {
  status: PlannerStatus
  error: PlannerError | null
  savedCount: number
  selectedRoute: PlannedRoute | null | undefined
  home: Waypoint | null | undefined
  /** Candidate count for the Choose/Prepare stage (SB-025). */
  routesCount: number
}

export interface PlannerLifecycleViewModel {
  /** Active planning lifecycle phase; idle when nothing is running. */
  phase: PlanningPhase
  /** Wall-clock start of the active lifecycle, for elapsed-time display. */
  startedAt: number | null
  /** True while the previous route stays visible but dimmed. */
  isRecalculating: boolean
  /** Human label for the current phase. */
  label: string
}

export interface PlannerDeckViewModel {
  waypoint: PlannerWaypointViewModel
  rideConfig: PlannerRideConfigViewModel
  intent: PlannerIntentViewModel
  ui: PlannerUiViewModel
  lifecycle: PlannerLifecycleViewModel
}

const PHASE_LABELS: Record<PlanningPhase, string> = {
  idle: "",
  interpreting: "Reading your ride request…",
  geocoding: "Finding places…",
  "routing-primary": "Routing your ride…",
  alternatives: "Adding alternatives…",
  ready: "Ride ready",
  cancelled: "Cancelled",
  error: "Could not plan this ride"
}

export function planningPhaseLabel(phase: PlanningPhase): string {
  return PHASE_LABELS[phase]
}

export function isActivePlanningPhase(phase: PlanningPhase): boolean {
  return phase === "interpreting" || phase === "geocoding"
    || phase === "routing-primary" || phase === "alternatives"
}

export interface PlannerWaypointCommands {
  onPointChange(id: PlannerPointId, point: Waypoint): void
  onPointQueryChange(id: PlannerPointId, query: string): void
  onArm(id: PlannerPointId): void
  onSwap(): void
  onToggleAddVia(): void
  onRemoveVia(index: number): void
  onMoveVia(fromIndex: number, toIndex: number): void
  onReverseRoute(): void
  onUndoRoutePoints(): void
  onRedoRoutePoints(): void
  onToggleViaLock(index: number): void
}

export interface PlannerRideConfigCommands {
  onPlanModeChange(mode: PlanMode): void
  onTargetMinutesChange(minutes: number): void
  onProfileChange(profile: RouteProfileId): void
  onBikeProfileChange(profile: BikeProfile): void
  onCurvatureChange(visible: boolean): void
  onAvoidHighwaysChange(avoid: boolean): void
  onSegmentProfileChange(index: number, profile: RouteProfileId): void
  onRemoveAvoidArea(): void
  onAddRoadLock(lock: RoadLock): void
  onUpdateRoadLock(id: string, patch: Partial<RoadLock>): void
  onRemoveRoadLock(id: string): void
  onConvertRoadLock(id: string): void
  onClearRoadLocks(): void
}

export interface PlannerIntentCommands {
  onRidePrompt(prompt: string): void
  onChooseStopIdea(stop: Waypoint): void
  onResearchRideIdea(prompt: string): void
}

export interface PlannerDeckCommands {
  waypoint: PlannerWaypointCommands
  rideConfig: PlannerRideConfigCommands
  intent: PlannerIntentCommands
  onClearRoute(): void
  onPlan(): void
  onOpenLibrary(): void
  onUseHome?(): void
  onSaveHome?(): void
  onClearHome?(): void
  onStartRide?(route: PlannedRoute): void
  onStartFreeRide?(): void
  onSaveOffline?(route: PlannedRoute, options?: import("@/lib/client/offline-pack-coordinator").OfflinePackCorridorOptions): void
  onCancelPlanning(): void
  /** Request the browser location and use it as the route start. */
  onUseCurrentLocation?(): void
}

export function buildPlannerDeckViewModel(state: {
  plan: TripPlan | null
  start: Waypoint | null
  finish: Waypoint | null
  startQuery: string
  finishQuery: string
  armedPoint: PlannerPointId | null
  profile: RouteProfileId
  bikeProfile: BikeProfile
  roadLocks: RoadLock[]
  status: PlannerStatus
  error: PlannerError | null
  curvatureVisible: boolean
  avoidHighways: boolean
  savedCount: number
  via: Waypoint[]
  addingVia: boolean
  segmentProfiles: RouteProfileId[]
  avoidAreaCount: number
  canUndoRoutePoints: boolean
  canRedoRoutePoints: boolean
  planMode: PlanMode
  targetMinutes: number
  intentStatus: RideIntentStatus
  intentSummary: string | null
  stopIdeas: PlaceIdeasResult | null
  researchStatus: "idle" | "researching"
  researchSources: RideResearchSource[]
  selectedRoute?: PlannedRoute | null
  home?: Waypoint | null
  planningPhase: PlanningPhase
  planningStartedAt: number | null
  isRecalculating: boolean
}): PlannerDeckViewModel {
  return {
    waypoint: {
      start: state.start,
      finish: state.finish,
      startQuery: state.startQuery,
      finishQuery: state.finishQuery,
      armedPoint: state.armedPoint,
      via: state.via,
      addingVia: state.addingVia,
      canUndoRoutePoints: state.canUndoRoutePoints,
      canRedoRoutePoints: state.canRedoRoutePoints
    },
    rideConfig: {
      planMode: state.planMode,
      targetMinutes: state.targetMinutes,
      profile: state.profile,
      bikeProfile: state.bikeProfile,
      roadLocks: state.roadLocks,
      curvatureVisible: state.curvatureVisible,
      avoidHighways: state.avoidHighways,
      segmentProfiles: state.segmentProfiles,
      avoidAreaCount: state.avoidAreaCount
    },
    intent: {
      intentStatus: state.intentStatus,
      intentSummary: state.intentSummary,
      stopIdeas: state.stopIdeas,
      researchStatus: state.researchStatus,
      researchSources: state.researchSources
    },
    ui: {
      status: state.status,
      error: state.error,
      savedCount: state.savedCount,
      selectedRoute: state.selectedRoute,
      home: state.home,
      routesCount: state.plan?.routes.length ?? 0
    },
    lifecycle: {
      phase: state.planningPhase,
      startedAt: state.planningStartedAt,
      isRecalculating: state.isRecalculating,
      label: planningPhaseLabel(state.planningPhase)
    }
  }
}
