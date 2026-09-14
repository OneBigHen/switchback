import type { Map as MapLibreMap, RasterDEMSourceSpecification } from "maplibre-gl"

/**
 * Terrain for Recon: 3D relief plus a quiet hillshade from one raster DEM.
 *
 * `NEXT_PUBLIC_RECON_TERRAIN_TILEJSON` selects the DEM TileJSON; unset uses
 * Mapterhorn's public terrarium tiles and `off` disables terrain entirely.
 * Any failure (fetch, malformed TileJSON, tile errors) removes terrain once
 * and never retries — terrain is atmosphere, never a fatal dependency. Only
 * ordinary tile requests leave the browser; no ride geometry is sent.
 */

export const DEFAULT_TERRAIN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json"
const TERRAIN_SOURCE = "recon-terrain"
const HILLSHADE_SOURCE = "recon-hillshade-dem"
const HILLSHADE_LAYER = "recon-hillshade"
const EXAGGERATION = 1.35
const DEFAULT_ATTRIBUTION = "© Mapterhorn"

export interface ReconTerrainHandle {
  dispose(): void
}

export interface TerrainTileJson {
  tiles: string[]
  encoding: "terrarium" | "mapbox"
  tileSize: 256 | 512
  maxzoom: number | undefined
  attribution: string
}

export function terrainTileJsonUrl(): string | null {
  // Read literally so the Next.js build inlines the public variable.
  const configured = process.env.NEXT_PUBLIC_RECON_TERRAIN_TILEJSON?.trim()
  if (configured === "off") return null
  return configured || DEFAULT_TERRAIN_TILEJSON
}

export function parseTerrainTileJson(body: unknown): TerrainTileJson | null {
  if (!body || typeof body !== "object") return null
  const record = body as Record<string, unknown>
  const tiles = record.tiles
  if (!Array.isArray(tiles) || tiles.length === 0 || !tiles.every((tile) => typeof tile === "string" && tile.startsWith("https://"))) {
    return null
  }
  const maxzoom = typeof record.maxzoom === "number" && Number.isFinite(record.maxzoom) ? Math.min(15, Math.max(8, Math.round(record.maxzoom))) : undefined
  return {
    tiles: tiles as string[],
    encoding: record.encoding === "mapbox" ? "mapbox" : "terrarium",
    tileSize: record.tileSize === 256 ? 256 : 512,
    maxzoom,
    attribution: typeof record.attribution === "string" && record.attribution.trim() ? record.attribution : DEFAULT_ATTRIBUTION
  }
}

function demSource(tileJson: TerrainTileJson): RasterDEMSourceSpecification {
  return {
    type: "raster-dem",
    tiles: tileJson.tiles,
    encoding: tileJson.encoding,
    tileSize: tileJson.tileSize,
    ...(tileJson.maxzoom !== undefined ? { maxzoom: tileJson.maxzoom } : {}),
    attribution: tileJson.attribution
  }
}

/** Attach terrain to a loaded map; call `dispose()` before `map.remove()`. */
export function enhanceReconMapTerrain(map: MapLibreMap, beforeLayerId?: string): ReconTerrainHandle {
  const url = terrainTileJsonUrl()
  if (!url) return { dispose() {} }

  const controller = new AbortController()
  let disabled = false

  // One strike: a DEM error repeats for every bad tile, so the first disables.
  const onError = (event: object) => {
    const sourceId = (event as { sourceId?: string }).sourceId
    if (sourceId === TERRAIN_SOURCE || sourceId === HILLSHADE_SOURCE) disable()
  }

  function disable(): void {
    if (disabled) return
    disabled = true
    map.off("error", onError)
    try {
      map.setTerrain(null)
      if (map.getLayer(HILLSHADE_LAYER)) map.removeLayer(HILLSHADE_LAYER)
    } catch {
      // The map may already be gone during unmount.
    }
  }

  void (async () => {
    try {
      const response = await fetch(url, { signal: controller.signal })
      const tileJson = response.ok ? parseTerrainTileJson(await response.json()) : null
      if (controller.signal.aborted || disabled) return
      if (!tileJson) return disable()
      map.on("error", onError)
      // MapLibre recommends separate DEM sources for terrain and hillshade.
      map.addSource(TERRAIN_SOURCE, demSource(tileJson))
      map.addSource(HILLSHADE_SOURCE, demSource(tileJson))
      map.addLayer(
        {
          id: HILLSHADE_LAYER,
          type: "hillshade",
          source: HILLSHADE_SOURCE,
          paint: {
            "hillshade-exaggeration": 0.45,
            "hillshade-shadow-color": "#243A35",
            "hillshade-highlight-color": "#FBF9F4",
            "hillshade-accent-color": "#776353",
            "hillshade-illumination-direction": 315
          }
        },
        beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined
      )
      map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: EXAGGERATION })
    } catch {
      if (!controller.signal.aborted) disable()
    }
  })()

  return {
    dispose() {
      controller.abort()
      disable()
    }
  }
}
