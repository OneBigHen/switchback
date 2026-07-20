import Dexie from "dexie"
import type { OfflineGraph } from "@/lib/offline/graph"
import { validateOfflineGraph, OFFLINE_GRAPH_SCHEMA_VERSION } from "@/lib/offline/graph"
import type { OfflineRegion } from "@/lib/offline/region-catalog"

export type RegionDownloadStatus =
  | "not-downloaded"
  | "downloading"
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

interface RegionBundleResponse {
  schemaVersion: number
  regionId: string
  bundleVersion: string
  builtAt: string
  checksum: string
  graph: OfflineGraph
}

const BUNDLE_TTL_MILLIS = 1000 * 60 * 60 * 24 * 7
const BUNDLE_EXPIRY_MILLIS = 1000 * 60 * 60 * 24 * 30

function regionStoreKey(regionId: string): string {
  return `switchback-region:${regionId}`
}

export class RegionDownloadClient {
  private readonly db: Dexie
  private abortControllers = new Map<string, AbortController>()

  constructor(readonly name = "switchback-region-downloads") {
    this.db = new Dexie(name)
    this.db.version(1).stores({ graphs: "&id, downloadedAt" })
  }

  private now(): number {
    return Date.now()
  }

  getStatus(state: RegionState): RegionDownloadStatus {
    if (state.status === "downloading" || state.status === "failed") return state.status
    if (!state.downloadedAt) return "not-downloaded"
    if (state.error) return "failed"
    const downloadedMs = Date.parse(state.downloadedAt)
    if (!Number.isFinite(downloadedMs)) return "expired"
    const age = this.now() - downloadedMs
    if (age < BUNDLE_TTL_MILLIS) return "ready"
    if (age < BUNDLE_EXPIRY_MILLIS) return "stale"
    return "expired"
  }

  async download(
    region: OfflineRegion,
    onProgress: (progress: number) => void
  ): Promise<OfflineGraph> {
    const key = regionStoreKey(region.id)
    this.abortControllers.get(key)?.abort()
    const controller = new AbortController()
    this.abortControllers.set(key, controller)

    try {
      const response = await fetch(region.tileUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      })
      if (!response.ok) {
        throw new Error(`Server returned ${response.status} ${response.statusText}`)
      }
      const contentLength = response.headers.get("content-length")
      const totalBytes = contentLength ? Number.parseInt(contentLength, 10) : region.estimatedDownloadBytes
      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        onProgress(1)
        const bundle: RegionBundleResponse = JSON.parse(text)
        return this.persist(region.id, bundle)
      }

      const chunks: Uint8Array[] = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.length
          onProgress(Math.min(received / totalBytes, 0.99))
        }
      }
      onProgress(1)
      const full = new TextDecoder().decode(
        chunks.reduce((acc, chunk) => {
          const merged = new Uint8Array(acc.length + chunk.length)
          merged.set(acc, 0)
          merged.set(chunk, acc.length)
          return merged
        }, new Uint8Array(0))
      )
      const bundle: RegionBundleResponse = JSON.parse(full)
      return this.persist(region.id, bundle)
    } finally {
      this.abortControllers.delete(key)
    }
  }

  cancel(regionId: string): void {
    this.abortControllers.get(regionStoreKey(regionId))?.abort()
  }

  private async persist(regionId: string, bundle: RegionBundleResponse): Promise<OfflineGraph> {
    if (!bundle.graph) throw new Error("Bundle contains no graph data")
    if (bundle.graph.schemaVersion !== OFFLINE_GRAPH_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported graph schema version ${bundle.graph.schemaVersion} (expected ${OFFLINE_GRAPH_SCHEMA_VERSION})`
      )
    }
    validateOfflineGraph(bundle.graph)
    const entry = {
      id: regionId,
      graph: bundle.graph,
      bundleVersion: bundle.bundleVersion,
      builtAt: bundle.builtAt,
      checksum: bundle.checksum,
      downloadedAt: new Date().toISOString()
    }
    await this.db.table("graphs").put(entry)
    return bundle.graph
  }

  async getGraph(regionId: string): Promise<OfflineGraph | null> {
    try {
      const entry = await this.db.table("graphs").get(regionId)
      return entry?.graph ?? null
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
    try {
      const entry = await this.db.table("graphs").get(regionId)
      if (!entry) return null
      return {
        id: entry.id,
        bundleVersion: entry.bundleVersion,
        builtAt: entry.builtAt,
        downloadedAt: entry.downloadedAt
      }
    } catch {
      return null
    }
  }

  async has(regionId: string): Promise<boolean> {
    try {
      const count = await this.db.table("graphs").where("id").equals(regionId).count()
      return count > 0
    } catch {
      return false
    }
  }

  async remove(regionId: string): Promise<void> {
    this.cancel(regionId)
    try {
      await this.db.table("graphs").delete(regionId)
    } catch {
      // already gone
    }
  }

  async list(): Promise<Array<{ id: string; builtAt: string; downloadedAt: string }>> {
    try {
      return await this.db.table("graphs").orderBy("downloadedAt").reverse().toArray()
    } catch {
      return []
    }
  }

  async getTotalBytes(): Promise<number> {
    try {
      const all = await this.db.table("graphs").toArray()
      return all.reduce((sum: number, e: { byteSize?: number }) => sum + (e.byteSize ?? 0), 0)
    } catch {
      return 0
    }
  }

  async destroy(): Promise<void> {
    for (const [key] of this.abortControllers) {
      this.abortControllers.get(key)?.abort()
    }
    this.db.close()
    await Dexie.delete(this.name)
  }
}
