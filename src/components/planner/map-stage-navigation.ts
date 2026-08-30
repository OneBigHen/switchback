import type { Map as MapLibreMap } from "maplibre-gl"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type { Coordinate as RouteCoordinate } from "@/lib/routing/types"
import { calculateRideFollowInsets } from "./workspace/map-viewport-insets"
import type {
  FollowCameraMap,
  NavigationCameraController
} from "@/lib/client/navigation-camera-controller"
import { usePlannerStore } from "@/stores/planner-store"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"
import { calculateMapViewportInsets, type WorkspaceMapContext } from "./workspace/map-viewport-insets"
import type { ContextSheetDetent } from "./workspace/context-sheet-state"

interface RouteViewportProps {
  routes: PlannedRoute[]
  selectedRouteId: string | null
  rideMode: boolean
  navigationFrame?: NavigationFrame | null
  /** When a recording trail is live, the camera belongs to the recording. */
  recordingTrail?: Coordinate[] | null
  /** Live ContextSheet detent so phone route fits track the visible sheet. */
  sheetDetent?: ContextSheetDetent
}

/**
 * Route-fit insets derived from workspace state. The legacy per-breakpoint
 * padding tables now live in the tested inset model; this adapter keeps
 * `fitSelectedRoute` call sites unchanged.
 */
function routeFitInsets(props: RouteViewportProps): ReturnType<typeof calculateMapViewportInsets> {
  const phoneViewport = typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 760px)").matches
  const sheetDetent = props.sheetDetent
    ?? usePlannerStore.getState().sheetDetentOverride
    ?? (phoneViewport ? "peek" : "half")
  const context: WorkspaceMapContext = {
    viewportWidthPx: window.innerWidth,
    viewportHeightPx: window.innerHeight,
    mode: props.rideMode ? "ride" : "planning",
    sheetDetent
  }
  return calculateMapViewportInsets(context)
}

export function fitSelectedRoute(map: MapLibreMap, props: RouteViewportProps) {
  if (props.rideMode && (props.navigationFrame || props.recordingTrail)) return
  const route = props.routes.find((item) => item.id === props.selectedRouteId)
  if (!route || route.geometry.length < 2) return
  const longitudes = route.geometry.map(([longitude]) => longitude)
  const latitudes = route.geometry.map(([, latitude]) => latitude)
  map.fitBounds(
    [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)]
    ],
    {
      padding: routeFitInsets(props),
      duration: 900,
      maxZoom: 15
    }
  )
}



/**
 * Applies one navigation frame to the ride camera through the follow-camera
 * controller. The controller owns the high-frequency state; this adapter only
 * supplies what has to come from the DOM — the viewport insets that place the
 * rider low in frame, and the selected route's geometry.
 */
export function followNavigationFrame(
  map: MapLibreMap,
  controller: NavigationCameraController,
  frame: NavigationFrame,
  options: { routeGeometry?: readonly RouteCoordinate[]; immediate?: boolean } = {}
): boolean {
  const padding = calculateRideFollowInsets({
    viewportWidthPx: window.innerWidth,
    viewportHeightPx: window.innerHeight,
    mode: "ride"
  })
  const context = { padding, routeGeometry: options.routeGeometry }
  if (options.immediate) {
    controller.recenter(map as unknown as FollowCameraMap, frame, context)
    return true
  }
  return controller.update(map as unknown as FollowCameraMap, frame, context)
}
