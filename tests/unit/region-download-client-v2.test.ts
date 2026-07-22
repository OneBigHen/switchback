import "fake-indexeddb/auto"

import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { OfflineRegion } from "@/lib/offline/region-catalog"
import { RegionDownloadClient } from "@/lib/storage/region-download-client"

const region: OfflineRegion = {
  id: "pennsylvania",
  name: "Pennsylvania",
  code: "PA",
  isoCode: "US-PA",
  manifestUrl: "/api/offline/regions/pennsylvania/manifest",
  sourceUrl: "https://example.com",
  bounds: { minLon: -80, minLat: 39, maxLon: -74, maxLat: 43 },
  estimatedDownloadBytes: 10,
  estimatedNodeCount: 2,
  estimatedEdgeCount: 1,
  dataDate: "2026-07-20T00:00:00Z",
  buildDate: "2026-07-21T00:00:00Z",
  bundleVersion: "2"
}

function manifest(version: string, bytes: Uint8Array, sha = createHash("sha256").update(bytes).digest("hex")) {
  return {
    schemaVersion: 2,
    regionId: region.id,
    regionName: region.name,
    version,
    compression: "gzip-json",
    buildDate: region.buildDate,
    sourceDataDate: region.dataDate,
    snapshotUrl: "https://example.com/pa.osm.pbf",
    sourceUrl: region.sourceUrl,
    bounds: region.bounds,
    checksums: { inventorySha256: "a".repeat(64) },
    attribution: "OpenStreetMap contributors",
    tiles: [{
      tileId: "10-20",
      bounds: region.bounds,
      bytes: bytes.byteLength,
      sha256: sha,
      nodeCount: 2,
      edgeCount: 1
    }],
    tileByteTotal: bytes.byteLength
  }
}

describe("RegionDownloadClient v2 atomic installs", () => {
  const clients: RegionDownloadClient[] = []

  afterEach(async () => {
    vi.unstubAllGlobals()
    for (const client of clients.splice(0)) await client.destroy()
  })

  it("downloads manifest tiles and activates only after checksum verification", async () => {
    const bytes = new TextEncoder().encode("valid-tile")
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/manifest")) return Response.json(manifest("v1", bytes))
      return new Response(bytes)
    })
    vi.stubGlobal("fetch", fetchMock)
    const client = new RegionDownloadClient(`regions-v2-${crypto.randomUUID()}`)
    clients.push(client)

    const progress: number[] = []
    const installed = await client.download(region, (value) => progress.push(value))

    expect(installed.version).toBe("v1")
    await expect(client.has(region.id)).resolves.toBe(true)
    await expect(client.getEntry(region.id)).resolves.toMatchObject({ bundleVersion: "v1" })
    await expect(client.getActiveTile(region.id, "10-20")).resolves.toEqual(bytes)
    expect(progress.at(-1)).toBe(1)
  })

  it("retains the previous active version when an update tile is corrupt", async () => {
    const v1 = new TextEncoder().encode("version-one")
    let activeManifest = manifest("v1", v1)
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/manifest")) return Response.json(activeManifest)
      return new Response(activeManifest.version === "v1" ? v1 : new TextEncoder().encode("corruptxxxx"))
    }))
    const client = new RegionDownloadClient(`regions-v2-${crypto.randomUUID()}`)
    clients.push(client)
    await client.download(region, () => undefined)

    const expectedV2 = new TextEncoder().encode("version-two")
    activeManifest = manifest("v2", expectedV2)
    await expect(client.download(region, () => undefined)).rejects.toThrow(/checksum/i)

    await expect(client.getEntry(region.id)).resolves.toMatchObject({ bundleVersion: "v1" })
    await expect(client.getActiveTile(region.id, "10-20")).resolves.toEqual(v1)
  })

  it("resumes an interrupted version without refetching verified tiles", async () => {
    const bytes = new TextEncoder().encode("resume-tile")
    let tileAttempts = 0
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/manifest")) return Response.json(manifest("v-resume", bytes))
      tileAttempts += 1
      if (tileAttempts === 1) throw new DOMException("cancelled", "AbortError")
      return new Response(bytes)
    }))
    const client = new RegionDownloadClient(`regions-v2-${crypto.randomUUID()}`)
    clients.push(client)

    await expect(client.download(region, () => undefined)).rejects.toThrow()
    await client.download(region, () => undefined)
    expect(tileAttempts).toBe(2)
    await expect(client.has(region.id)).resolves.toBe(true)
  })

  it("loads and validates only active spatial graph tiles", async () => {
    const rawTile = {
      schemaVersion: 2,
      tileId: "10-20",
      bounds: region.bounds,
      nodes: [
        { id: "a", coordinate: [-76, 40] },
        { id: "b", coordinate: [-75.99, 40] }
      ],
      edges: [{
        id: "ab",
        fromNodeId: "a",
        toNodeId: "b",
        geometry: [[-76, 40], [-75.99, 40]],
        osmWayId: "10",
        motorcycleAccess: "permitted",
        access: "permitted",
        roadClass: "tertiary",
        surface: "asphalt",
        profileWeights: { quick: 1, twisty: 1, scenic: 1, adventure: 1 },
        uncertainty: []
      }],
      turnRestrictions: []
    }
    const compressed = new Uint8Array(gzipSync(JSON.stringify(rawTile)))
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/manifest")) return Response.json(manifest("v-graph", compressed))
      return new Response(compressed)
    }))
    const client = new RegionDownloadClient(`regions-v2-${crypto.randomUUID()}`)
    clients.push(client)
    await client.download(region, () => undefined)

    const tiles = await client.getActiveGraphTiles(region.id, region.bounds)
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toMatchObject({ schemaVersion: 2, edges: [{ osmWayId: "10" }] })
  })
})
