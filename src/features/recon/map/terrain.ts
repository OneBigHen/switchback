import type { Map as MapLibreMap, RasterDEMSourceSpecification } from "maplibre-gl"

/**
 * Terrain for Recon: 3D relief plus a quiet hillshade from one raster DEM.
 *
 * `NEXT_PUBLIC_RECON_TERRAIN_TILEJSON` selects the DEM TileJSON; unset uses
 * Mapterhorn's public terrarium tiles and `off` disables terrain entirely.
 * A failed TileJSON or repeated tile errors remove terrain once and never
 * retry, and software WebGL skips it: terrain is atmosphere, never a fatal
 * dependency. Only ordinary tile requests leave the browser, never ride data.
 */

export const DEFAULT_TERRAIN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json"
const TERRAIN_SOURCE = "recon-terrain"
const HILLSHADE_SOURCE = "recon-hillshade-dem"
const HILLSHADE_LAYER = "recon-hillshade"
const EXAGGERATION = 1.35
const DEFAULT_ATTRIBUTION = "© Mapterhorn"
/**
 * Mapterhorn's TileJSON omits maxzoom, so MapLibre would request z17+ tiles
 * that 404 (probed 2026-09-13 over PA/NJ: z15 served, z17 404). Relief past
 * z14 adds nothing at replay zooms, and MapLibre overzooms beyond maxzoom.
 */
const DEFAULT_DEM_MAXZOOM = 14
/** A handful of missing tiles is coverage, not a broken source. */
const MAX_TILE_ERRORS = 6

export interface ReconTerrainHandle {
  dispose(): void
}

export interface TerrainTileJson {
  tiles: string[]
  encoding: "terrarium" | "mapbox"
  tileSize: 256 | 512
  maxzoom: number
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
  const maxzoom = typeof record.maxzoom === "number" && Number.isFinite(record.maxzoom) ? Math.min(15, Math.max(8, Math.round(record.maxzoom))) : DEFAULT_DEM_MAXZOOM
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
    maxzoom: tileJson.maxzoom,
    attribution: tileJson.attribution
  }
}

/**
 * Software WebGL (SwiftShader, llvmpipe) renders 3D terrain at a few frames a
 * minute; on those renderers Recon stays flat so Replay remains usable.
 */
export function isSoftwareRenderer(map: MapLibreMap): boolean {
  try {
    const canvas = map.getCanvas()
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null
    if (!gl) return true
    const info = gl.getExtension("WEBGL_debug_renderer_info")
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)
  } catch {
    return false
  }
}

/** Attach terrain to a loaded map; call `dispose()` before `map.remove()`. */
export function enhanceReconMapTerrain(map: MapLibreMap, beforeLayerId?: string): ReconTerrainHandle {
  const url = terrainTileJsonUrl()
  if (!url || isSoftwareRenderer(map)) return { dispose() {} }

  const controller = new AbortController()
  let disabled = false

  // A dead DEM host errors on every tile; stop after a few instead of storming.
  let tileErrors = 0
  const onError = (event: object) => {
    const sourceId = (event as { sourceId?: string }).sourceId
    if ((sourceId === TERRAIN_SOURCE || sourceId === HILLSHADE_SOURCE) && ++tileErrors >= MAX_TILE_ERRORS) disable()
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
