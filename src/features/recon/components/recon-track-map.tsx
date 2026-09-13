"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type {
  CircleLayerSpecification,
  GeoJSONSource,
  LineLayerSpecification,
} from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import { mapStyleUrl } from "@/lib/client/map-layers";
import type { ReconTrack } from "@/features/recon/types";
import styles from "./recon-explorer.module.css";

/**
 * The Recon Explorer map: a flat MapLibre map with one selected track drawn
 * on top. Recorded rides paint Ember; route previews paint Signal. The HUD
 * and picker always name the kind in text, so colour is never the only
 * carrier. One WebGL context, created lazily in the browser, removed on
 * unmount. No terrain, no animation loops, no per-frame React state.
 */

const EMBER = "#D65A36";
const SIGNAL = "#397C96";
const INK = "#161D1C";
const PAPER = "#FBF9F4";
const TRACK_SOURCE = "recon-track";

/**
 * MapLibre v6 splits its worker into a separate chunk that bundler consumers
 * must resolve explicitly with one `setWorkerUrl` call. Without it the
 * failure is silent and total: the basemap and controls still draw, but the
 * worker dies before handling any source, so GeoJSON data and the `load`
 * event never arrive. The vendored worker pair is published to `public/`
 * by `scripts/copy-maplibre-worker.mjs` (same constraint as the planner
 * renderer, configured here for Recon's own module instance).
 */
const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
const workerConfiguredModules = new WeakSet<object>();

function configureMapLibreWorker(maplibre: typeof import("maplibre-gl")): void {
  if (workerConfiguredModules.has(maplibre)) return;
  workerConfiguredModules.add(maplibre);
  maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);
}

type TrackCollection = FeatureCollection<LineString | Point>;

export default function ReconTrackMap({ track }: { track: ReconTrack | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const pendingTrackRef = useRef<ReconTrack | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    configureMapLibreWorker(maplibregl);

    const map = new maplibregl.Map({
      container,
      style: mapStyleUrl("explorer"),
      center: [-77.5, 40.9],
      zoom: 6.8,
      pitch: 0,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    const onLoad = () => {
      loadedRef.current = true;
      map.addSource(TRACK_SOURCE, {
        type: "geojson",
        data: emptyCollection(),
      });
      map.addLayer(trackCasingLayer());
      map.addLayer(trackLineLayer());
      map.addLayer(
        trackEndpointLayer("recon-track-start", "start", PAPER, EMBER),
      );
      map.addLayer(trackEndpointLayer("recon-track-end", "end", INK, PAPER));

      const pending = pendingTrackRef.current;
      pendingTrackRef.current = null;
      applyTrack(map, pending);
    };
    map.on("load", onLoad);

    return () => {
      map.off("load", onLoad);
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      pendingTrackRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) {
      pendingTrackRef.current = track;
      return;
    }
    applyTrack(map, track);
  }, [track]);

  return <div className={styles.mapSurface} ref={containerRef} />;
}

function applyTrack(map: maplibregl.Map, track: ReconTrack | null): void {
  const source = map.getSource(TRACK_SOURCE);
  if (!source) return;
  (source as GeoJSONSource).setData(
    track ? trackCollection(track) : emptyCollection(),
  );
  if (track) fitToTrack(map, track);
}

function fitToTrack(map: maplibregl.Map, track: ReconTrack): void {
  const bounds = new maplibregl.LngLatBounds();
  for (const coordinate of track.geometry.coordinates)
    bounds.extend(coordinate);
  if (bounds.isEmpty()) return;
  map.fitBounds(bounds, {
    padding: 96,
    duration: prefersReducedMotion() ? 0 : 800,
    maxZoom: 13,
    pitch: 0,
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function emptyCollection(): TrackCollection {
  return { type: "FeatureCollection", features: [] };
}

function trackCollection(track: ReconTrack): TrackCollection {
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

function trackCasingLayer(): LineLayerSpecification {
  return {
    id: "recon-track-casing",
    type: "line",
    source: TRACK_SOURCE,
    paint: {
      "line-color": INK,
      "line-opacity": 0.5,
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 9],
    },
  };
}

function trackLineLayer(): LineLayerSpecification {
  return {
    id: "recon-track-line",
    type: "line",
    source: TRACK_SOURCE,
    paint: {
      // Recorded = Ember (current ride), preview = Signal. The HUD names the
      // kind in text so the colour is never the only carrier.
      "line-color": [
        "match",
        ["get", "playbackKind"],
        "recorded",
        EMBER,
        SIGNAL,
      ],
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3.5, 14, 6.5],
    },
  };
}

function trackEndpointLayer(
  id: string,
  kind: string,
  color: string,
  strokeColor: string,
): CircleLayerSpecification {
  return {
    id,
    type: "circle",
    source: TRACK_SOURCE,
    filter: ["==", ["get", "kind"], kind],
    paint: {
      "circle-radius": 4.5,
      "circle-color": color,
      "circle-stroke-color": strokeColor,
      "circle-stroke-width": 2,
    },
  };
}
