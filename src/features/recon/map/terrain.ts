import type {
  Map as MapLibreMap,
  RasterDEMSourceSpecification,
  RasterTileSource,
} from "maplibre-gl";

/**
 * Terrain enhancement for the Recon explorer.
 *
 * Contract: `NEXT_PUBLIC_RECON_TERRAIN_TILEJSON` points at a
 * Mapterhorn-compatible raster DEM TileJSON. Absent variable → flat map, no
 * fetch, no error. Any failure along the way (fetch, malformed TileJSON,
 * source error event) removes the terrain exactly once, marks it disabled,
 * and never retries — terrain is atmosphere, never a fatal dependency. The
 * source keeps its attribution string so MapLibre's attribution control
 * stays truthful either way.
 */

export const RECON_TERRAIN_SOURCE = "recon-terrain";

const DEFAULT_TERRAIN_ATTRIBUTION =
  "© Mapterhorn © OpenStreetMap contributors";
/** Inside the allowed 1.0–1.15 band; enough relief without exaggeration. */
const TERRAIN_EXAGGERATION = 1.1;
/** Max zoom is clamped into 8..15: below 8 the DEM is uselessly coarse. */
const MIN_DEM_MAXZOOM = 8;
const MAX_DEM_MAXZOOM = 15;
/**
 * Mapterhorn-style DEM tiles are 256 px. Set explicitly because MapLibre's
 * raster default (512) would misread the tile pyramid at low zooms.
 */
const DEM_TILE_SIZE = 256;

export interface ReconTerrainHandle {
  /** Removes terrain, detaches listeners and aborts any in-flight fetch. */
  dispose(): void;
}

interface TerrainSourceInput {
  tiles: string[];
  encoding: "terrarium" | "mapbox";
  maxzoom?: number;
  attribution: string;
}

/**
 * Attach terrain to a loaded map. Returns a handle whose dispose() must be
 * called on unmount before map.remove().
 */
export function enhanceReconMapTerrain(map: MapLibreMap): ReconTerrainHandle {
  // Read literally so the Next.js build inlines the public env variable.
  const tileJsonUrl = process.env.NEXT_PUBLIC_RECON_TERRAIN_TILEJSON?.trim();
  if (!tileJsonUrl) return { dispose() {} };

  const controller = new AbortController();
  let disabled = false;
  let source: RasterTileSource | null = null;

  const detachListener = () => {
    if (!source) return;
    source.off("error", onSourceError);
    source = null;
  };

  const disable = () => {
    if (disabled) return;
    disabled = true;
    detachListener();
    try {
      map.setTerrain(null);
    } catch {
      // The map may already be gone during unmount; terrain removal is
      // best-effort and never fatal.
    }
  };

  function onSourceError(): void {
    // One strike: a broken DEM source disables terrain permanently. No retry
    // storm — a source "error" repeats for every bad tile, so the first one
    // wins and the listener is removed immediately.
    disable();
  }

  void (async () => {
    try {
      const response = await fetch(tileJsonUrl, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        disable();
        return;
      }
      const parsed = parseTerrainTileJson(await response.json());
      if (!parsed || disabled || controller.signal.aborted) {
        if (!controller.signal.aborted) disable();
        return;
      }
      map.addSource(RECON_TERRAIN_SOURCE, toRasterDemSpec(parsed));
      const added = map.getSource(RECON_TERRAIN_SOURCE) as
        | RasterTileSource
        | undefined;
      if (!added) {
        disable();
        return;
      }
      source = added;
      added.on("error", onSourceError);
      if (disabled) {
        // An error or dispose landed between addSource and setTerrain.
        detachListener();
        return;
      }
      map.setTerrain({
        source: RECON_TERRAIN_SOURCE,
        exaggeration: TERRAIN_EXAGGERATION,
      });
    } catch {
      if (controller.signal.aborted) return;
      // Fetch failure or malformed body: terrain off, never fatal.
      disable();
    }
  })();

  return {
    dispose() {
      disable();
      controller.abort();
    },
  };
}

/** Validate the TileJSON into a DEM source input, or null when unusable. */
function parseTerrainTileJson(body: unknown): TerrainSourceInput | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;

  const tiles = record.tiles;
  if (!Array.isArray(tiles) || tiles.length === 0) return null;
  if (
    !tiles.every(
      (tile) => typeof tile === "string" && tile.startsWith("https://"),
    )
  ) {
    return null;
  }

  // The env contract is a Mapterhorn-compatible raster DEM, so only the two
  // known encodings are accepted; anything else (or absent) falls back to the
  // contract default, terrarium.
  const encoding =
    record.encoding === "mapbox" || record.encoding === "terrarium"
      ? record.encoding
      : "terrarium";

  const attribution =
    typeof record.attribution === "string" &&
    record.attribution.trim().length > 0
      ? record.attribution
      : DEFAULT_TERRAIN_ATTRIBUTION;

  const maxzoom =
    typeof record.maxzoom === "number" && Number.isFinite(record.maxzoom)
      ? Math.min(
          MAX_DEM_MAXZOOM,
          Math.max(MIN_DEM_MAXZOOM, Math.round(record.maxzoom)),
        )
      : undefined;

  return { tiles: tiles as string[], encoding, maxzoom, attribution };
}

function toRasterDemSpec(
  input: TerrainSourceInput,
): RasterDEMSourceSpecification {
  return {
    type: "raster-dem",
    tiles: input.tiles,
    encoding: input.encoding,
    ...(input.maxzoom !== undefined ? { maxzoom: input.maxzoom } : {}),
    tileSize: DEM_TILE_SIZE,
    attribution: input.attribution,
  };
}
