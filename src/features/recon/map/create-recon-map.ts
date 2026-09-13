import * as maplibregl from "maplibre-gl";
import { RECON_BASEMAP_STYLE_URL, RECON_CAMERA } from "./recon-map-style";

/**
 * The ONE factory that constructs a MapLibre map for Recon. No other Recon
 * module may build a MapLibre instance: the worker contract, the camera and
 * the controls live here so every Recon surface behaves identically.
 */

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

/**
 * Create the Recon explorer map. Cinematic by configuration: pitched,
 * intentionally off-north, compact attribution, compass available so riders
 * can always find north again.
 */
export function createReconMap(container: HTMLElement): maplibregl.Map {
  configureMapLibreWorker(maplibregl);

  const map = new maplibregl.Map({
    container,
    style: RECON_BASEMAP_STYLE_URL,
    center: RECON_CAMERA.center,
    zoom: RECON_CAMERA.zoom,
    pitch: RECON_CAMERA.pitch,
    bearing: RECON_CAMERA.bearing,
    maxPitch: RECON_CAMERA.maxPitch,
    attributionControl: { compact: true },
  });
  map.addControl(
    new maplibregl.NavigationControl({ showCompass: true }),
    "bottom-right",
  );
  return map;
}
