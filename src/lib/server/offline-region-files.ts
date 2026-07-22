import { readFile } from "node:fs/promises"
import { join } from "node:path"

import {
  validateOfflineRegionManifestV2,
  type OfflineRegionManifestV2
} from "@/lib/offline/v2-contracts"

const REGION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VERSION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
const TILE_ID = /^[a-z0-9][a-z0-9_-]*$/

export class OfflineRegionFileError extends Error {
  constructor(readonly status: 400 | 404 | 500, message: string) {
    super(message)
  }
}

function rootDirectory(): string {
  return process.env.SWITCHBACK_OFFLINE_REGION_ROOT || join(process.cwd(), "data", "offline-regions")
}

export function isSafeRegionId(value: string): boolean {
  return REGION_ID.test(value)
}

export function isSafeTileId(value: string): boolean {
  return TILE_ID.test(value)
}

export async function readActiveManifest(regionId: string): Promise<OfflineRegionManifestV2> {
  if (!isSafeRegionId(regionId)) {
    throw new OfflineRegionFileError(400, "Invalid region identifier")
  }

  try {
    const active = JSON.parse(
      await readFile(join(rootDirectory(), regionId, "active.json"), "utf8")
    ) as { version?: unknown }
    if (typeof active.version !== "string" || !VERSION_ID.test(active.version)) {
      throw new OfflineRegionFileError(500, "Offline region activation metadata is invalid")
    }
    const raw = JSON.parse(
      await readFile(join(rootDirectory(), regionId, active.version, "manifest.json"), "utf8")
    ) as unknown
    if (!validateOfflineRegionManifestV2(raw)) {
      throw new OfflineRegionFileError(500, "Offline region manifest is corrupt")
    }
    if (raw.regionId !== regionId || raw.version !== active.version) {
      throw new OfflineRegionFileError(500, "Offline region activation does not match its manifest")
    }
    return raw
  } catch (error) {
    if (error instanceof OfflineRegionFileError) throw error
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new OfflineRegionFileError(404, "Offline region is not available")
    }
    throw new OfflineRegionFileError(500, "Offline region metadata could not be read")
  }
}

export async function readManifestTile(
  manifest: OfflineRegionManifestV2,
  tileId: string
): Promise<{ bytes: Uint8Array; sha256: string }> {
  if (!isSafeTileId(tileId)) {
    throw new OfflineRegionFileError(400, "Invalid tile identifier")
  }
  const entry = manifest.tiles.find((tile) => tile.tileId === tileId)
  if (!entry) throw new OfflineRegionFileError(404, "Offline tile was not found")

  try {
    const bytes = await readFile(
      join(rootDirectory(), manifest.regionId, manifest.version, "tiles", `${tileId}.json.gz`)
    )
    if (bytes.byteLength !== entry.bytes) {
      throw new OfflineRegionFileError(500, "Offline tile size does not match its manifest")
    }
    return { bytes, sha256: entry.sha256 }
  } catch (error) {
    if (error instanceof OfflineRegionFileError) throw error
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new OfflineRegionFileError(404, "Offline tile was not found")
    }
    throw new OfflineRegionFileError(500, "Offline tile could not be read")
  }
}
