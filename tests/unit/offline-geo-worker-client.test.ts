import { describe, expect, it } from "vitest"
import {
  buildOfflineRoutingWorkerFailure,
  buildOfflineRoutingWorkerOk,
  type OfflineRoutingWorkerRequest
} from "@/lib/offline/worker-protocol"
import { ByteLru } from "@/lib/offline/byte-lru"
import {
  OfflineGeoWorkerClient,
  type OfflineGeoWorkerLike
} from "@/lib/offline/geo-worker-client"
import type { OfflineGraphTileReference, OfflineGraphTileSource } from "@/lib/offline/geo-tile-source"
import { routeOfflineV2 } from "@/lib/offline/v2-router"
import type { OfflineGraphTileV2 } from "@/lib/offline/v2-contracts"

const coordinates: Record<string, [number, number]> = {
  a: [-76, 40], b: [-75.99, 40], c: [-75.98, 40]
}

const graphTile: OfflineGraphTileV2 = {
  schemaVersion: 2,
  tileId: "inside",
  bounds: { minLon: -76.1, minLat: 39.9, maxLon: -75.9, maxLat: 40.1 },
  nodes: Object.entries(coordinates).map(([id, coordinate]) => ({ id, coordinate })),
  edges: [
    { id: "ab", fromNodeId: "a", toNodeId: "b", geometry: [coordinates.a, coordinates.b], osmWayId: "10", motorcycleAccess: "permitted", access: "permitted", roadClass: "tertiary", surface: "asphalt", profileWeights: { quick: 10, twisty: 10, scenic: 10, adventure: 10 }, uncertainty: [] },
    { id: "bc", fromNodeId: "b", toNodeId: "c", geometry: [coordinates.b, coordinates.c], osmWayId: "11", motorcycleAccess: "permitted", access: "permitted", roadClass: "tertiary", surface: "asphalt", profileWeights: { quick: 10, twisty: 10, scenic: 10, adventure: 10 }, uncertainty: [] }
  ],
  turnRestrictions: []
}

class FakeSource implements OfflineGraphTileSource {
  loads = 0
  constructor(readonly references: OfflineGraphTileReference[]) {}

  async listActiveTileReferences(_regionId: string, bounds?: OfflineGraphTileReference["bounds"]): Promise<OfflineGraphTileReference[]> {
    return this.references.filter((reference) => !bounds || reference.bounds.minLon <= bounds.maxLon && reference.bounds.maxLon >= bounds.minLon && reference.bounds.minLat <= bounds.maxLat && reference.bounds.maxLat >= bounds.minLat)
  }

  async loadActiveTile(_regionId: string, tileId: string): Promise<OfflineGraphTileV2> {
    this.loads += 1
    const reference = this.references.find((candidate) => candidate.tileId === tileId)
    if (!reference) throw new Error(`missing ${tileId}`)
    return graphTile
  }
}

class FakeWorker implements OfflineGeoWorkerLike {
  private readonly messageListeners = new Set<(event: MessageEvent) => void>()
  private readonly errorListeners = new Set<(event: ErrorEvent) => void>()
  terminated = false

  addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void {
    if (type === "message") this.messageListeners.add(listener as (event: MessageEvent) => void)
    else this.errorListeners.add(listener as (event: ErrorEvent) => void)
  }

  removeEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void {
    if (type === "message") this.messageListeners.delete(listener as (event: MessageEvent) => void)
    else this.errorListeners.delete(listener as (event: ErrorEvent) => void)
  }

  postMessage(message: OfflineRoutingWorkerRequest): void {
    if (message.kind !== "route_v2") return
    queueMicrotask(() => {
      if (this.terminated) return
      const result = routeOfflineV2(message.tiles as OfflineGraphTileV2[], message.routeRequest as Parameters<typeof routeOfflineV2>[1])
      const response = result.ok
        ? buildOfflineRoutingWorkerOk(message, result)
        : buildOfflineRoutingWorkerFailure(message, result.kind, result.message)
      for (const listener of this.messageListeners) listener({ data: response } as MessageEvent)
    })
  }

  terminate(): void {
    this.terminated = true
    this.messageListeners.clear()
    this.errorListeners.clear()
  }
}

function reference(tileId = "inside", bounds = graphTile.bounds): OfflineGraphTileReference {
  return { regionId: "pennsylvania", version: "fixture-1", tileId, bounds, bytes: 1_024, sha256: "a".repeat(64) }
}

const request = {
  start: coordinates.a,
  finish: coordinates.c,
  profile: "quick" as const,
  bikeCompatibility: "dual-sport" as const,
  requiredRegionIds: ["pennsylvania"],
  installedRegionIds: ["pennsylvania"]
}

describe("ByteLru", () => {
  it("evicts least-recently-used entries by bytes and never exceeds its cap", () => {
    const cache = new ByteLru<string>(10)
    expect(cache.set("a", "A", 6)).toBe(true)
    expect(cache.set("b", "B", 4)).toBe(true)
    expect(cache.get("a")).toBe("A")
    expect(cache.set("c", "C", 4)).toBe(true)
    expect(cache.has("a")).toBe(true)
    expect(cache.has("b")).toBe(false)
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: 10, maxBytes: 10 })
    expect(cache.set("too-large", "x", 11)).toBe(false)
  })
})

describe("OfflineGeoWorkerClient", () => {
  it("loads only intersecting tiles, reuses decoded tiles, and routes in the worker seam", async () => {
    const source = new FakeSource([
      reference(),
      reference("outside", { minLon: -80, minLat: 35, maxLon: -79, maxLat: 36 })
    ])
    const worker = new FakeWorker()
    const client = new OfflineGeoWorkerClient(source, {
      workerFactory: () => worker,
      maxCacheBytes: 100_000
    })

    await expect(client.route(request)).resolves.toMatchObject({ ok: true, edgeIds: ["ab", "bc"] })
    await expect(client.route(request)).resolves.toMatchObject({ ok: true })
    expect(source.loads).toBe(1)
    expect(client.getCacheStats().entries).toBe(1)
    client.dispose()
    expect(worker.terminated).toBe(true)
  })

  it("returns a bounded search-budget failure instead of flooding the worker", async () => {
    const source = new FakeSource([reference(), reference("second", { ...graphTile.bounds, minLon: -76.2, maxLon: -76.05 })])
    const client = new OfflineGeoWorkerClient(source, {
      workerFactory: () => new FakeWorker(),
      maxTiles: 1
    })
    await expect(client.route(request)).resolves.toMatchObject({ ok: false, kind: "search_budget" })
    client.dispose()
  })

  it("cancels before loading or dispatching work", async () => {
    const source = new FakeSource([reference()])
    const client = new OfflineGeoWorkerClient(source, { workerFactory: () => new FakeWorker() })
    const controller = new AbortController()
    controller.abort()
    await expect(client.route(request, { signal: controller.signal })).resolves.toMatchObject({ ok: false, kind: "cancelled" })
    expect(source.loads).toBe(0)
    client.dispose()
  })

  it("reports missing regions before opening the tile source", async () => {
    const source = new FakeSource([reference()])
    const client = new OfflineGeoWorkerClient(source, { workerFactory: () => new FakeWorker() })
    await expect(client.route({ ...request, installedRegionIds: [] })).resolves.toMatchObject({
      ok: false,
      kind: "missing_region",
      missingRegionIds: ["pennsylvania"]
    })
    expect(source.loads).toBe(0)
    client.dispose()
  })
})
