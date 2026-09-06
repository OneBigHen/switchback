import type { PlaceIdeasResult } from "@/lib/client/place-ideas-client"
import type { RoutePlanSummary } from "@/lib/client/route-entity-cache"
import type { RideResearchSource } from "@/lib/ai/ride-research"
import type { BikeProfile } from "@/lib/routing/bike-profiles"
import type { RoadLock } from "@/lib/roads/road-locks"
import type { PlannedRoute, RouteProfileId, TollPolicy, Waypoint } from "@/lib/routing/types"
import type { PlannerError, PlannerPointId, PlannerStatus, PlanningPhase } from "@/stores/planner-store"

export type PlanMode = "destination" | "loop"
export type RideIntentStatus = "idle" | "interpreting"

export type PlannerProviderHealthStatus =
  | "healthy"
  | "unknown"
  | "checking"
  | "offline"
  | "unverified"
  | "graphhopper-unavailable"
  | "valhalla-degraded"

export interface PlannerProviderHealthViewModel {
  status: PlannerProviderHealthStatus
}

export interface PlannerWaypointViewModel {
  start: Waypoint | null
  finish: Waypoint | null
  startQuery: string
  finishQuery: string
  armedPoint: PlannerPointId | null
  via: Waypoint[]
  addingVia: boolean
}

/** Whole-ride change history. Undo reverses the rider's last ride change,
 *  whatever it touched — not whichever field happens to own a setter. */
export interface PlannerRideHistoryViewModel {
  canUndoRideChange: boolean
  canRedoRideChange: boolean
  /** Plain-language description of the last rider change, for confirmation. */
  lastChangeLabel: string | null
  /** True while the shown route answers an older ride than the current one. */
  hasUnappliedChange: boolean
}

export interface PlannerRideConfigViewModel {
  planMode: PlanMode
  targetMinutes: number
  /** Destination rides: whether the rider opted into a time-shaped route. */
  timeShaped: boolean
  profile: RouteProfileId
  bikeProfile: BikeProfile
  roadLocks: RoadLock[]
  curvatureVisible: boolean
  avoidHighways: boolean
  tollPolicy: TollPolicy
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
  rideHistory: PlannerRideHistoryViewModel
  rideConfig: PlannerRideConfigViewModel
  intent: PlannerIntentViewModel
  ui: PlannerUiViewModel
  lifecycle: PlannerLifecycleViewModel
  providerHealth?: PlannerProviderHealthViewModel
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
  onToggleViaLock(index: number): void
}

export interface PlannerRideHistoryCommands {
  onUndoRideChange(): void
  onRedoRideChange(): void
}

export interface PlannerRideConfigCommands {
  onPlanModeChange(mode: PlanMode): void
  /** Ride time is one decision — how long, and whether time shapes the route
   *  at all — so it travels as one command and lands as one ride change. */
  onRideTimeChange(minutes: number, shaped: boolean): void
  onProfileChange(profile: RouteProfileId): void
  onBikeProfileChange(profile: BikeProfile): void
  onCurvatureChange(visible: boolean): void
  onAvoidHighwaysChange(avoid: boolean): void
  onTollPolicyChange(policy: TollPolicy): void
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
  rideHistory: PlannerRideHistoryCommands
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
  /** Enter the existing map sketch surface from the compact Plan composer. */
  onStartDrawing?(): void
  onSaveOffline?(route: PlannedRoute, options?: import("@/lib/client/offline-pack-coordinator").OfflinePackCorridorOptions): void
  /**
   * One Cancel, one meaning: stop the calculation in flight and put the last
   * usable ride back. With nothing committed yet it simply stops planning.
   */
  onCancelRideChange(): void
  onRetryProviderHealth?(): void
  /** Request the browser location and use it as the route start. */
  onUseCurrentLocation?(): void
}

export function buildPlannerDeckViewModel(state: {
  plan: RoutePlanSummary | null
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
  tollPolicy: TollPolicy
  savedCount: number
  via: Waypoint[]
  addingVia: boolean
  segmentProfiles: RouteProfileId[]
  avoidAreaCount: number
  canUndoRideChange: boolean
  canRedoRideChange: boolean
  lastChangeLabel: string | null
  hasUnappliedChange: boolean
  planMode: PlanMode
  targetMinutes: number
  timeShaped: boolean
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
  providerHealth?: PlannerProviderHealthViewModel
}): PlannerDeckViewModel {
  return {
    waypoint: {
      start: state.start,
      finish: state.finish,
      startQuery: state.startQuery,
      finishQuery: state.finishQuery,
      armedPoint: state.armedPoint,
      via: state.via,
      addingVia: state.addingVia
    },
    rideHistory: {
      canUndoRideChange: state.canUndoRideChange,
      canRedoRideChange: state.canRedoRideChange,
      lastChangeLabel: state.lastChangeLabel,
      hasUnappliedChange: state.hasUnappliedChange
    },
    rideConfig: {
      planMode: state.planMode,
      targetMinutes: state.targetMinutes,
      timeShaped: state.timeShaped,
      profile: state.profile,
      bikeProfile: state.bikeProfile,
      roadLocks: state.roadLocks,
      curvatureVisible: state.curvatureVisible,
      avoidHighways: state.avoidHighways,
      tollPolicy: state.tollPolicy,
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
    },
    providerHealth: state.providerHealth ?? { status: "unknown" }
  }
}
