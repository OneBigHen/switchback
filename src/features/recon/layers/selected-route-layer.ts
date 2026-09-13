import type { Feature, FeatureCollection, Point, LineString } from "geojson";
import type {
  GeoJSONSourceSpecification,
  LayerSpecification,
  LineLayerSpecification,
} from "maplibre-gl";
import type { ReconTrack } from "@/features/recon/types";
import {
  RECON_COLORS,
  routeEndpointPaint,
  selectedRecordedLinePaint,
  selectedRouteCasingPaint,
  selectedRouteGlowPaint,
  selectedPreviewLinePaint,
} from "../map/recon-map-style";

/**
 * The selected route: the strongest thing on screen.
 *
 * Recorded rides paint Ember and stay solid; previews paint Signal and carry
 * a dash, so playback kind is distinguishable by pattern as well as colour.
 * A restrained ember glow and an ink casing keep the line legible over
 * satellite-style basemaps without ever reading as neon.
 */

export const RECON_SELECTED_SOURCE = "recon-selected";

export type SelectedTrackCollection = FeatureCollection<LineString | Point>;

export function selectedRouteSourceSpec(): GeoJSONSourceSpecification {
  return { type: "geojson", data: emptySelectedCollection() };
}

/**
 * Layer stack for the selection, bottom→top: glow, casing, main line
 * (recorded and preview variants), then the endpoint markers. The two main
 * line layers filter on `playbackKind` because `line-dasharray` cannot be
 * data-driven — the pattern must live on its own layer.
 */
export function selectedRouteLayerSpecs(): LayerSpecification[] {
  const line = (
    id: string,
    filter: unknown,
    paint: ReturnType<typeof selectedRecordedLinePaint>,
  ): LineLayerSpecification => ({
    id,
    type: "line",
    source: RECON_SELECTED_SOURCE,
    filter: filter as LineLayerSpecification["filter"],
    paint,
  });

  return [
    {
      id: "recon-selected-glow",
      type: "line",
      source: RECON_SELECTED_SOURCE,
      paint: selectedRouteGlowPaint(),
    },
    {
      id: "recon-selected-casing",
      type: "line",
      source: RECON_SELECTED_SOURCE,
      paint: selectedRouteCasingPaint(),
    },
    line(
      "recon-selected-line-recorded",
      ["==", ["get", "playbackKind"], "recorded"],
      selectedRecordedLinePaint(),
    ),
    line(
      "recon-selected-line-preview",
      ["==", ["get", "playbackKind"], "preview"],
      selectedPreviewLinePaint(),
    ),
    {
      id: "recon-selected-start",
      type: "circle",
      source: RECON_SELECTED_SOURCE,
      filter: ["==", ["get", "kind"], "start"],
      paint: routeEndpointPaint(RECON_COLORS.paper, RECON_COLORS.ember),
    },
    {
      id: "recon-selected-end",
      type: "circle",
      source: RECON_SELECTED_SOURCE,
      filter: ["==", ["get", "kind"], "end"],
      paint: routeEndpointPaint(RECON_COLORS.ink, RECON_COLORS.paper),
    },
  ];
}

export function emptySelectedCollection(): SelectedTrackCollection {
  return { type: "FeatureCollection", features: [] };
}

/** The line plus its start and end markers, as one collection. */
export function selectedTrackCollection(
  track: ReconTrack,
): SelectedTrackCollection {
  const coordinates = track.geometry.coordinates;
  const line: Feature<LineString> = {
    type: "Feature",
    properties: { kind: "line", playbackKind: track.playbackKind },
    geometry: { type: "LineString", coordinates: [...coordinates] },
  };
  const start: Feature<Point> = {
    type: "Feature",
    properties: { kind: "start" },
    geometry: { type: "Point", coordinates: coordinates[0]! },
  };
  const end: Feature<Point> = {
    type: "Feature",
    properties: { kind: "end" },
    geometry: {
      type: "Point",
      coordinates: coordinates[coordinates.length - 1]!,
    },
  };
  return { type: "FeatureCollection", features: [line, start, end] };
}
