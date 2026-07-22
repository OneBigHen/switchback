import Dexie, { type Table } from "dexie"

import type { OfflineGraph } from "@/lib/offline/graph"
import { validateOfflineGraph } from "@/lib/offline/graph"
import type { OfflineRegion } from "@/lib/offline/region-catalog"
import {
  validateOfflineGraphTileV2,
  validateOfflineRegionManifestV2,
  type OfflineBounds,
  type OfflineGraphTileV2,
  type OfflineRegionManifestV2
} from "@/lib/offline/v2-contracts"

export type RegionDownloadStatus =
  | "not-downloaded"
  | "downloading"
  | "paused"
  | "ready"
  | "stale"
  | "expired"
  | "failed"

export interface RegionState {
  regionId: string
  status: RegionDownloadStatus
  downloadedAt: string | null
  byteSize: number | null
  progress: number
  error: string | null
}

interface RegionPointer {
  id: string
  activeVersion: string
  previousVersion: string | null
  builtAt: string
  downloadedAt: string
  byteSize: number
}

interface StoredVersion {
  id: string
  regionId: string
  version: string
  status: "pending" | "active" | "previous"
  manifest: OfflineRegionManifestV2
  downloadedAt: string | null
}

interface StoredTile {
  id: string
  regionId: string
  versionKey: string
  tileId: string
  sha256: string
  byteSize: number
  bytes: Uint8Array
}

interface LegacyGraphEntry {
  id: string
  kind?: string
  graph?: OfflineGraph
  downloadedAt?: string
}

const BUNDLE_TTL_MILLIS = 1000 * 60 * 60 * 24 * 7
const BUNDLE_EXPIRY_MILLIS = 1000 * 60 * 60 * 24 * 30

function versionKey(regionId: string, version: string): string {
  return `${regionId}:${version}`
}

function tileKey(regionId: string, version: string, tileId: string): string {
  return `${versionKey(regionId, version)}:${tileId}`
}

function tileUrl(region: OfflineRegion, tileId: string): string {
  return region.manifestUrl.replace(/\/manifest$/, `/tiles/${encodeURIComponent(tileId)}`)
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer)
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("")
}

function intersects(a: OfflineBounds, b: OfflineBounds): boolean {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat
}

async function decompressGraphTile(bytes: Uint8Array): Promise<OfflineGraphTileV2> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const compressed = new Response(copy.buffer).body
  if (!compressed) throw new Error("Installed offline tile could not be read")
  const stream = compressed.pipeThrough(new DecompressionStream("gzip"))
  const parsed: unknown = JSON.parse(await new Response(stream).text())
  if (!validateOfflineGraphTileV2(parsed)) throw new Error("Installed offline tile is corrupt")
  return parsed
}

export class RegionDownloadClient {
  private readonly db: Dexie
  private readonly regions: Table<RegionPointer, string>
  private readonly versions: Table<StoredVersion, string>
  private readonly tiles: Table<StoredTile, string>
  private readonly graphs: Table<LegacyGraphEntry, string>
  private abortControllers = new Map<string, AbortController>()

  constructor(readonly name = "switchback-region-downloads") {
    this.db = new Dexie(name)
    this.db.version(1).stores({ graphs: "&id, downloadedAt" })
    this.db.version(2).stores({
      graphs: "&id, downloadedAt",
      regions: "&id, downloadedAt",
      versions: "&id, regionId, status, downloadedAt",
      tiles: "&id, regionId, versionKey"
    })
    this.regions = this.db.table("regions")
    this.versions = this.db.table("versions")
    this.tiles = this.db.table("tiles")
    this.graphs = this.db.table("graphs")
  }

  private now(): number {
    return Date.now()
  }

  getStatus(state: RegionState): RegionDownloadStatus {
    if (state.status === "downloading" || state.status === "paused" || state.status === "failed") return state.status
    if (!state.downloadedAt) return "not-downloaded"
    if (state.error) return "failed"
    const downloadedMs = Date.parse(state.downloadedAt)
    if (!Number.isFinite(downloadedMs)) return "expired"
    const age = this.now() - downloadedMs
    if (age < BUNDLE_TTL_MILLIS) return "ready"
    if (age < BUNDLE_EXPIRY_MILLIS) return "stale"
    return "expired"
  }

  private async checkQuota(requiredBytes: number): Promise<void> {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate?.quota) return
    const available = estimate.quota - (estimate.usage ?? 0)
    if (available < requiredBytes) {
      throw new Error("Not enough device storage for this offline region")
    }
  }

  async download(
    region: OfflineRegion,
    onProgress: (progress: number) => void
  ): Promise<OfflineRegionManifestV2> {
    this.cancel(region.id)
    const controller = new AbortController()
    this.abortControllers.set(region.id, controller)

    try {
      const manifestResponse = await fetch(region.manifestUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      })
      if (!manifestResponse.ok) {
        throw new Error(`Manifest request failed (${manifestResponse.status})`)
      }
      const manifest: unknown = await manifestResponse.json()
      if (!validateOfflineRegionManifestV2(manifest) || manifest.regionId !== region.id) {
        throw new Error("Offline region manifest is invalid")
      }
      await this.checkQuota(manifest.tileByteTotal)

      const nextVersionKey = versionKey(region.id, manifest.version)
      const pending: StoredVersion = {
        id: nextVersionKey,
        regionId: region.id,
        version: manifest.version,
        status: "pending",
        manifest,
        downloadedAt: null
      }
      await this.versions.put(pending)

      let completedBytes = 0
      for (const entry of manifest.tiles) {
        const id = tileKey(region.id, manifest.version, entry.tileId)
        const existing = await this.tiles.get(id)
        if (existing?.sha256 === entry.sha256 && existing.byteSize === entry.bytes) {
          completedBytes += entry.bytes
          onProgress(completedBytes / manifest.tileByteTotal)
          continue
        }

        const response = await fetch(tileUrl(region, entry.tileId), {
          signal: controller.signal,
          headers: { Accept: "application/json" }
        })
        if (!response.ok) throw new Error(`Tile ${entry.tileId} request failed (${response.status})`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength !== entry.bytes) throw new Error(`Tile ${entry.tileId} size mismatch`)
        if ((await sha256(bytes)) !== entry.sha256.toLowerCase()) {
          throw new Error(`Tile ${entry.tileId} checksum mismatch`)
        }
        await this.tiles.put({
          id,
          regionId: region.id,
          versionKey: nextVersionKey,
          tileId: entry.tileId,
          sha256: entry.sha256,
          byteSize: entry.bytes,
          bytes
        })
        completedBytes += entry.bytes
        onProgress(completedBytes / manifest.tileByteTotal)
      }

      const activatedAt = new Date().toISOString()
      await this.db.transaction("rw", this.regions, this.versions, this.tiles, async () => {
        const current = await this.regions.get(region.id)
        if (current?.previousVersion && current.previousVersion !== current.activeVersion) {
          const obsoleteKey = versionKey(region.id, current.previousVersion)
          await this.tiles.where("versionKey").equals(obsoleteKey).delete()
          await this.versions.delete(obsoleteKey)
        }
        if (current?.activeVersion && current.activeVersion !== manifest.version) {
          const previousKey = versionKey(region.id, current.activeVersion)
          await this.versions.update(previousKey, { status: "previous" })
        }
        await this.versions.put({ ...pending, status: "active", downloadedAt: activatedAt })
        await this.regions.put({
          id: region.id,
          activeVersion: manifest.version,
          previousVersion:
            current?.activeVersion && current.activeVersion !== manifest.version
              ? current.activeVersion
              : current?.previousVersion ?? null,
          builtAt: manifest.buildDate,
          downloadedAt: activatedAt,
          byteSize: manifest.tileByteTotal
        })
      })
      onProgress(1)
      return manifest
    } finally {
      this.abortControllers.delete(region.id)
    }
  }

  cancel(regionId: string): void {
    this.abortControllers.get(regionId)?.abort()
  }

  pause(regionId: string): void {
    this.cancel(regionId)
  }

  async getActiveTile(regionId: string, tileId: string): Promise<Uint8Array | null> {
    const pointer = await this.regions.get(regionId)
    if (!pointer) return null
    const tile = await this.tiles.get(tileKey(regionId, pointer.activeVersion, tileId))
    return tile?.bytes ?? null
  }

  async getActiveGraphTiles(
    regionId: string,
    searchBounds?: OfflineBounds
  ): Promise<OfflineGraphTileV2[]> {
    const pointer = await this.regions.get(regionId)
    if (!pointer) return []
    const storedVersion = await this.versions.get(versionKey(regionId, pointer.activeVersion))
    if (!storedVersion) throw new Error("Active offline region metadata is missing")
    const entries = searchBounds
      ? storedVersion.manifest.tiles.filter((tile) => intersects(tile.bounds, searchBounds))
      : storedVersion.manifest.tiles
    const result: OfflineGraphTileV2[] = []
    for (const entry of entries) {
      const stored = await this.tiles.get(tileKey(regionId, pointer.activeVersion, entry.tileId))
      if (!stored || stored.sha256 !== entry.sha256) throw new Error(`Installed offline tile ${entry.tileId} is missing`)
      result.push(await decompressGraphTile(stored.bytes))
    }
    return result
  }

  /** v1 corridor packs remain readable; v1 regional prototypes are never treated as regional routing. */
  async getGraph(regionId: string): Promise<OfflineGraph | null> {
    try {
      const entry = await this.graphs.get(regionId)
      if (entry?.kind !== "corridor" || !entry.graph) return null
      validateOfflineGraph(entry.graph)
      return entry.graph
    } catch {
      return null
    }
  }

  async getEntry(regionId: string): Promise<{
    id: string
    bundleVersion: string
    builtAt: string
    downloadedAt: string
  } | null> {
    const entry = await this.regions.get(regionId)
    if (!entry) return null
    return {
      id: entry.id,
      bundleVersion: entry.activeVersion,
      builtAt: entry.builtAt,
      downloadedAt: entry.downloadedAt
    }
  }

  async has(regionId: string): Promise<boolean> {
    return (await this.regions.get(regionId)) !== undefined
  }

  async remove(regionId: string): Promise<void> {
    this.cancel(regionId)
    await this.db.transaction("rw", this.regions, this.versions, this.tiles, this.graphs, async () => {
      await this.tiles.where("regionId").equals(regionId).delete()
      await this.versions.where("regionId").equals(regionId).delete()
      await this.regions.delete(regionId)
      await this.graphs.delete(regionId)
    })
  }

  async list(): Promise<Array<{ id: string; builtAt: string; downloadedAt: string }>> {
    return this.regions.orderBy("downloadedAt").reverse().toArray()
  }

  async getTotalBytes(): Promise<number> {
    const all = await this.tiles.toArray()
    return all.reduce((sum, tile) => sum + tile.byteSize, 0)
  }

  async destroy(): Promise<void> {
    for (const regionId of this.abortControllers.keys()) this.cancel(regionId)
    this.db.close()
    await Dexie.delete(this.name)
  }
}
