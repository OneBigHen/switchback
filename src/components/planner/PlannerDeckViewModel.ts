import type { PlaceIdeasResult } from "@/lib/client/place-ideas-client"
import type { RideResearchSource } from "@/lib/ai/ride-research"
import type { PlannedRoute, RouteProfileId, Waypoint } from "@/lib/routing/types"
import type { PlannerError, PlannerPointId, PlannerStatus } from "@/stores/planner-store"

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
}

export interface PlannerDeckViewModel {
  waypoint: PlannerWaypointViewModel
  rideConfig: PlannerRideConfigViewModel
  intent: PlannerIntentViewModel
  ui: PlannerUiViewModel
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
  onCurvatureChange(visible: boolean): void
  onAvoidHighwaysChange(avoid: boolean): void
  onSegmentProfileChange(index: number, profile: RouteProfileId): void
  onRemoveAvoidArea(): void
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
  onSaveOffline?(route: PlannedRoute): void
}

export function buildPlannerDeckViewModel(state: {
  start: Waypoint | null
  finish: Waypoint | null
  startQuery: string
  finishQuery: string
  armedPoint: PlannerPointId | null
  profile: RouteProfileId
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
      home: state.home
    }
  }
}
