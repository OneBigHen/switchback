import type { Feature, FeatureCollection, LineString } from "geojson";
import type {
  GeoJSONSourceSpecification,
  LayerSpecification,
} from "maplibre-gl";
import type { ReconTrack } from "@/features/recon/types";
import { rideHistoryLinePaint } from "../map/recon-map-style";

/**
 * Ride history: every recorded ride except the selected one, drawn thin and
 * quiet so the selection always dominates. SAGE and MOSS alternate per ride;
 * the HUD and picker still name each ride in text.
 */

export const RECON_HISTORY_SOURCE = "recon-history";

export type RideHistoryCollection = FeatureCollection<LineString>;

export function rideHistorySourceSpec(): GeoJSONSourceSpecification {
  return { type: "geojson", data: emptyHistoryCollection() };
}

export function rideHistoryLayerSpecs(): LayerSpecification[] {
  return [
    {
      id: "recon-history-line",
      type: "line",
      source: RECON_HISTORY_SOURCE,
      paint: rideHistoryLinePaint(),
    },
  ];
}

export function emptyHistoryCollection(): RideHistoryCollection {
  return { type: "FeatureCollection", features: [] };
}

export function rideHistoryCollection(
  tracks: readonly ReconTrack[],
): RideHistoryCollection {
  const features: Feature<LineString>[] = tracks.map((track, index) => ({
    type: "Feature",
    properties: {
      kind: "history",
      tone: index % 2 === 0 ? "sage" : "moss",
    },
    geometry: { type: "LineString", coordinates: [...track.geometry.coordinates] },
  }));
  return { type: "FeatureCollection", features };
}
