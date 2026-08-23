import type { Map as MapLibreMap } from "maplibre-gl"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import { navigationCameraOptions } from "@/lib/client/navigation-map"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"
import { calculateMapViewportInsets, type WorkspaceMapContext } from "./workspace/map-viewport-insets"

interface RouteViewportProps {
  routes: PlannedRoute[]
  selectedRouteId: string | null
  rideMode: boolean
  navigationFrame?: NavigationFrame | null
  /** When a recording trail is live, the camera belongs to the recording. */
  recordingTrail?: Coordinate[] | null
}

/**
 * Route-fit insets derived from workspace state. The legacy per-breakpoint
 * padding tables now live in the tested inset model; this adapter keeps
 * `fitSelectedRoute` call sites unchanged.
 */
function routeFitInsets(props: RouteViewportProps): ReturnType<typeof calculateMapViewportInsets> {
  const context: WorkspaceMapContext = {
    viewportWidthPx: window.innerWidth,
    viewportHeightPx: window.innerHeight,
    mode: props.rideMode ? "ride" : "planning"
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

export function followNavigationFrame(map: MapLibreMap, frame: NavigationFrame, immediate = false) {
  map.easeTo({
    ...navigationCameraOptions(frame, { width: window.innerWidth, height: window.innerHeight }),
    duration: immediate ? 0 : 650
  })
}
