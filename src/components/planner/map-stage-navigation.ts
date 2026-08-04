import type { Map as MapLibreMap } from "maplibre-gl"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import { navigationCameraOptions } from "@/lib/client/navigation-map"
import type { Coordinate, PlannedRoute } from "@/lib/routing/types"

interface RouteViewportProps {
  routes: PlannedRoute[]
  selectedRouteId: string | null
  rideMode: boolean
  navigationFrame?: NavigationFrame | null
  /** When a recording trail is live, the camera belongs to the recording. */
  recordingTrail?: Coordinate[] | null
}

function routeFitPadding(rideMode: boolean) {
  const shortLandscape = window.innerHeight <= 520 && window.innerWidth > window.innerHeight
  if (shortLandscape && window.innerWidth >= 800) {
    return rideMode
      ? { top: 80, right: 40, bottom: 150, left: 40 }
      : { top: 40, right: 40, bottom: 40, left: 500 }
  }
  if (shortLandscape) {
    return rideMode
      ? { top: 72, right: 24, bottom: 150, left: 24 }
      : { top: 24, right: 24, bottom: 170, left: 24 }
  }
  return window.innerWidth >= 800
    ? { top: 80, right: 70, bottom: 80, left: rideMode ? 70 : 500 }
    : { top: 90, right: 34, bottom: rideMode ? 250 : 450, left: 34 }
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
      padding: routeFitPadding(props.rideMode),
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
