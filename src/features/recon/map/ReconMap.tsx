"use client";

import { useEffect, useRef } from "react";
import bearing from "@turf/bearing";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { ReconTrack } from "../types";
import { createReconMap } from "./create-recon-map";
import { enhanceReconMapTerrain, type ReconTerrainHandle } from "./terrain";
import {
  applyReconAtmosphere,
  RECON_CAMERA,
  RECON_FIT_DURATION_MS,
  RECON_FIT_MAX_ZOOM,
} from "./recon-map-style";
import {
  RECON_SELECTED_SOURCE,
  emptySelectedCollection,
  selectedRouteLayerSpecs,
  selectedRouteSourceSpec,
  selectedTrackCollection,
} from "../layers/selected-route-layer";
import {
  RECON_HISTORY_SOURCE,
  rideHistoryCollection,
  rideHistoryLayerSpecs,
  rideHistorySourceSpec,
} from "../layers/ride-history-layer";
import {
  RECON_EVIDENCE_SOURCE,
  emptyEvidenceCollection,
  gravelEvidenceLayerSpecs,
  gravelEvidenceSourceSpec,
  type GravelEvidenceCollection,
} from "../layers/gravel-evidence-layer";

/**
 * The Recon Explorer map. One MapLibre instance, created lazily in the
 * browser through the one Recon factory, pitched and terrain-capable.
 *
 * Layer order bottom→top: gravel evidence, ride history, then the selected
 * route (glow, casing, line, endpoints) — the selection is always the
 * strongest thing on screen. React never sees per-frame camera state: the
 * map is fitted once per newly selected track and otherwise left alone.
 */

/** Debug/test seam for the critical suite, planner-style (see map-stage-sources). */
declare global {
  interface Window {
    __reconMapDebug?: {
      getPitch(): number;
      getBearing(): number;
      getZoom(): number;
    };
  }
}

export interface ReconMapProps {
  selectedTrack: ReconTrack | null;
  historyTracks: ReconTrack[];
  /** Atlas corridor features near the selection, or null while absent. */
  evidence: GravelEvidenceCollection | null;
}

export default function ReconMap({
  selectedTrack,
  historyTracks,
  evidence,
}: ReconMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const terrainRef = useRef<ReconTerrainHandle | null>(null);
  const loadedRef = useRef(false);
  const fittedTrackIdRef = useRef<string | null>(null);
  const latestPropsRef = useRef<ReconMapProps>({
    selectedTrack,
    historyTracks,
    evidence,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = createReconMap(container);
    mapRef.current = map;

    const onLoad = () => {
      // Bottom→top so depth ordering is deterministic without insertLayer
      // bookkeeping: evidence under history under the selection.
      map.addSource(RECON_EVIDENCE_SOURCE, gravelEvidenceSourceSpec());
      for (const layer of gravelEvidenceLayerSpecs()) map.addLayer(layer);
      map.addSource(RECON_HISTORY_SOURCE, rideHistorySourceSpec());
      for (const layer of rideHistoryLayerSpecs()) map.addLayer(layer);
      map.addSource(RECON_SELECTED_SOURCE, selectedRouteSourceSpec());
      for (const layer of selectedRouteLayerSpecs()) map.addLayer(layer);
      applyReconAtmosphere(map);
      terrainRef.current = enhanceReconMapTerrain(map);
      // Debug/test seam, following the planner's `__switchbackMapSourcesDebug`
      // convention: lets the critical suite assert the pitched camera without
      // owning a second WebGL context or per-frame React state.
      window.__reconMapDebug = {
        getPitch: () => map.getPitch(),
        getBearing: () => map.getBearing(),
        getZoom: () => map.getZoom(),
      };
      loadedRef.current = true;
      applyProps(map, latestPropsRef.current, fittedTrackIdRef);
    };
    map.on("load", onLoad);

    return () => {
      map.off("load", onLoad);
      delete window.__reconMapDebug;
      terrainRef.current?.dispose();
      terrainRef.current = null;
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      fittedTrackIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Sync the latest props for the load path, then apply them when the map
    // is ready. The ref is only touched inside effects, never during render.
    latestPropsRef.current = { selectedTrack, historyTracks, evidence };
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    applyProps(
      map,
      { selectedTrack, historyTracks, evidence },
      fittedTrackIdRef,
    );
  }, [selectedTrack, historyTracks, evidence]);

  return <div className="recon-map-canvas" ref={containerRef} />;
}

function applyProps(
  map: MapLibreMap,
  props: ReconMapProps,
  fittedTrackIdRef: { current: string | null },
): void {
  const selectedSource = map.getSource(
    RECON_SELECTED_SOURCE,
  ) as GeoJSONSource | null;
  selectedSource?.setData(
    props.selectedTrack
      ? selectedTrackCollection(props.selectedTrack)
      : emptySelectedCollection(),
  );

  const historySource = map.getSource(
    RECON_HISTORY_SOURCE,
  ) as GeoJSONSource | null;
  historySource?.setData(rideHistoryCollection(props.historyTracks));

  const evidenceSource = map.getSource(
    RECON_EVIDENCE_SOURCE,
  ) as GeoJSONSource | null;
  evidenceSource?.setData(props.evidence ?? emptyEvidenceCollection());

  const track = props.selectedTrack;
  if (track && track.id !== fittedTrackIdRef.current) {
    // One deliberate fit per newly selected track; the rider owns the
    // camera afterwards.
    fittedTrackIdRef.current = track.id;
    fitToTrack(map, track);
  }
}

function fitToTrack(map: MapLibreMap, track: ReconTrack): void {
  const coordinates = track.geometry.coordinates;
  if (coordinates.length < 2) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const coordinate of coordinates) bounds.extend(coordinate);
  if (bounds.isEmpty()) return;
  map.fitBounds(bounds, {
    padding: { top: 96, bottom: 208, left: 120, right: 120 },
    pitch: RECON_CAMERA.pitch,
    bearing: routeBearing(track),
    maxZoom: RECON_FIT_MAX_ZOOM,
    duration: prefersReducedMotion() ? 0 : RECON_FIT_DURATION_MS,
    essential: true,
  });
}

/**
 * Bearing along the ride's opening direction, so the field faces down the
 * route instead of an arbitrary north. Degenerate or unreadable geometry
 * falls back to the intentional default bearing.
 */
function routeBearing(track: ReconTrack): number {
  const coordinates = track.geometry.coordinates;
  const start = coordinates[0]!;
  const ahead = coordinates[Math.floor((coordinates.length - 1) * 0.2)]!;
  if (start[0] === ahead[0] && start[1] === ahead[1]) {
    return RECON_CAMERA.bearing;
  }
  const degrees = bearing([start[0]!, start[1]!], [ahead[0]!, ahead[1]!]);
  return Number.isFinite(degrees) ? degrees : RECON_CAMERA.bearing;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
