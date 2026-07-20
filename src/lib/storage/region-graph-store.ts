import Dexie, { type EntityTable } from "dexie"
import type { OfflineGraph } from "@/lib/offline/graph"
import { OFFLINE_GRAPH_SCHEMA_VERSION, validateOfflineGraph } from "@/lib/offline/graph"

export interface StoredRegionGraph {
  id: string
  graph: OfflineGraph
  downloadedAt: string
  byteSize: number
}

class RegionGraphDatabase extends Dexie {
  graphs!: EntityTable<StoredRegionGraph, "id">

  constructor(name: string) {
    super(name)
    this.version(1).stores({ graphs: "&id, downloadedAt" })
  }
}

export class RegionGraphStore {
  private readonly database: RegionGraphDatabase

  constructor(readonly name = "switchback-region-graphs") {
    this.database = new RegionGraphDatabase(name)
  }

  async save(regionId: string, graph: OfflineGraph): Promise<StoredRegionGraph> {
    if (graph.schemaVersion !== OFFLINE_GRAPH_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported graph schema version ${graph.schemaVersion} (expected ${OFFLINE_GRAPH_SCHEMA_VERSION})`
      )
    }
    validateOfflineGraph(graph)
    const byteSize = new TextEncoder().encode(JSON.stringify(graph)).byteLength
    const entry: StoredRegionGraph = {
      id: regionId,
      graph,
      downloadedAt: new Date().toISOString(),
      byteSize
    }
    await this.database.graphs.put(entry)
    return entry
  }

  async get(regionId: string): Promise<StoredRegionGraph | undefined> {
    return this.database.graphs.get(regionId)
  }

  async has(regionId: string): Promise<boolean> {
    const count = await this.database.graphs.where("id").equals(regionId).count()
    return count > 0
  }

  async list(): Promise<StoredRegionGraph[]> {
    return this.database.graphs.orderBy("downloadedAt").reverse().toArray()
  }

  async getTotalBytes(): Promise<number> {
    const all = await this.database.graphs.toArray()
    return all.reduce((sum, entry) => sum + entry.byteSize, 0)
  }

  async remove(regionId: string): Promise<void> {
    await this.database.graphs.delete(regionId)
  }

  async destroy(): Promise<void> {
    this.database.close()
    await Dexie.delete(this.name)
  }
}
