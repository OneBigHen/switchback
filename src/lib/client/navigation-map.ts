import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson"
import type { NavigationFrame } from "@/lib/client/navigation-engine"

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
