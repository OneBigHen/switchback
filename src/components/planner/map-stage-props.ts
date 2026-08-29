import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type { ReferenceMap } from "@/lib/client/reference-map"
import type {
  RiderLayerId,
  RiderLayerSetting,
  RiderMapPack
} from "@/lib/client/map-layers"
import type { MapExperienceId, MapLightPreference } from "@/lib/client/map-experience"
import type { AvoidArea, Coordinate, PlannedRoute, Waypoint } from "@/lib/routing/types"
import type { PlannerPointId } from "@/stores/planner-store"

/**
 * The planner's map contract. It lives apart from the stage components so the
 * renderer-neutral stage, the Mapbox stage, and PlannerShell can share it
 * without a cycle.
 */
export interface MapStageProps {
  routes: PlannedRoute[]
  selectedRouteId: string | null
  start: Waypoint | null
  finish: Waypoint | null
  via: Waypoint[]
  armedPoint: PlannerPointId | null
  addingVia: boolean
  /** Phase 6: the previous route stays visible but dimmed during replan. */
  recalculating?: boolean
  curvatureVisible: boolean
  unpavedVisible: boolean
  mapExperience: MapExperienceId
  lightPreference: MapLightPreference
  riderLayers: RiderLayerSetting[]
  routeVisibility: "standard" | "high-contrast"
  mapPacks: RiderMapPack[]
  rideMode: boolean
  navigationFrame?: NavigationFrame | null
  onCurvatureChange(visible: boolean): void
  onUnpavedChange(visible: boolean): void
  onMapExperienceChange(experience: MapExperienceId): void
  onLightPreferenceChange(preference: MapLightPreference): void
  onRiderLayerChange(id: RiderLayerId, patch: Partial<Pick<RiderLayerSetting, "visible" | "opacity">>): void
  onMoveRiderLayer(id: RiderLayerId, direction: "earlier" | "later"): void
  onRouteVisibilityChange(visibility: "standard" | "high-contrast"): void
  onSaveMapPack(name: string): void
  onApplyMapPack(id: string): void
  referenceMap: ReferenceMap | null
  onReferenceMapChange(reference: ReferenceMap | null): void
  onWaypointDrag(kind: "start" | "finish" | "via", index: number, point: Waypoint): void
  onMapPick(point: Waypoint): void
  onRouteSketch(trace: Waypoint[]): void
  onSketchModeChange(active: boolean): void
  avoidAreas: AvoidArea[]
  onAvoidArea(area: AvoidArea): void
  /** A browser "locate me" fix was produced; the planner should adopt it as the start. */
  onLocateMe?(point: { lat: number; lon: number }): void
  /** Live breadcrumb trail for a recording session in ride mode. */
  recordingTrail?: Coordinate[] | null
}
