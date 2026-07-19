import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson"
import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type { Coordinate } from "@/lib/routing/types"

export interface NavigationViewport {
  width: number
  height: number
}

export interface NavigationCameraOptions {
  center: Coordinate
  bearing?: number
  pitch: number
  zoom: number
  padding: { top: number; right: number; bottom: number; left: number }
  duration: number
  essential: true
}

export function navigationCameraOptions(
  frame: NavigationFrame,
  viewport: NavigationViewport
): NavigationCameraOptions {
  const landscape = viewport.height <= 520 && viewport.width > viewport.height
  const compact = viewport.width < 760
  const speed = frame.speedMetersPerSecond ?? 0
  const followZoom = speed >= 20 ? 15.6 : speed >= 8 ? 16.1 : 16.7
  const recovering = frame.status === "deviating" || frame.status === "off-route"
  const recoveryZoom = frame.distanceFromRouteMeters >= 1_200
    ? 13.4
    : frame.distanceFromRouteMeters >= 500
      ? 14.1
      : frame.distanceFromRouteMeters >= 150 ? 14.8 : 15.5
  const zoom = recovering ? Math.min(followZoom, recoveryZoom) : followZoom
  const pitch = recovering || frame.status === "uncertain" || frame.status === "weak-signal"
    ? 28
    : frame.status === "arrived" ? 18 : 52
  const padding = landscape
    ? { top: 112, right: 24, bottom: 52, left: 24 }
    : compact
      ? { top: 220, right: 28, bottom: 92, left: 28 }
      : { top: 150, right: 88, bottom: 100, left: 430 }

  return {
    center: frame.rawCoordinate,
    ...(frame.headingDegrees == null ? {} : { bearing: frame.headingDegrees }),
    pitch,
    zoom,
    padding,
    duration: 650,
    essential: true
  }
}

export function buildNavigationMapFeatures(
  frame: NavigationFrame
): FeatureCollection<Geometry, GeoJsonProperties> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "match-link", status: frame.status },
        geometry: {
          type: "LineString",
          coordinates: [frame.rawCoordinate, frame.matchedCoordinate]
        }
      },
      {
        type: "Feature",
        properties: { kind: "matched-position", status: frame.status },
        geometry: { type: "Point", coordinates: frame.matchedCoordinate }
      },
      {
        type: "Feature",
        properties: {
          kind: "rider-position",
          status: frame.status,
          bearing: frame.headingDegrees ?? 0,
          accuracy: frame.accuracyMeters
        },
        geometry: { type: "Point", coordinates: frame.rawCoordinate }
      }
    ]
  }
}
