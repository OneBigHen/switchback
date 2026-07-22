import { createHash } from "node:crypto"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { GET as getManifest } from "@/app/api/offline/regions/[regionId]/manifest/route"
import {
  GET as getTile,
  HEAD as headTile
} from "@/app/api/offline/regions/[regionId]/tiles/[tileId]/route"

const tileBytes = new TextEncoder().encode("0123456789")
const tileSha = createHash("sha256").update(tileBytes).digest("hex")

describe("offline region v2 API", () => {
  let root = ""
  const previousRoot = process.env.SWITCHBACK_OFFLINE_REGION_ROOT

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "switchback-offline-api-"))
    const versionDir = join(root, "pennsylvania", "v-test")
    await mkdir(join(versionDir, "tiles"), { recursive: true })
    await writeFile(join(versionDir, "tiles", "10-20.json.gz"), tileBytes)
    await writeFile(
      join(root, "pennsylvania", "active.json"),
      JSON.stringify({ version: "v-test" })
    )
    await writeFile(
      join(versionDir, "manifest.json"),
      JSON.stringify({
        schemaVersion: 2,
        regionId: "pennsylvania",
        regionName: "Pennsylvania",
        version: "v-test",
        compression: "gzip-json",
        buildDate: "2026-07-21T00:00:00Z",
        sourceDataDate: "2026-07-20T00:00:00Z",
        snapshotUrl: "https://download.geofabrik.de/pennsylvania.osm.pbf",
        sourceUrl: "https://download.geofabrik.de/pennsylvania.html",
        bounds: { minLon: -80.52, minLat: 39.72, maxLon: -74.69, maxLat: 42.27 },
        checksums: { inventorySha256: "a".repeat(64) },
        attribution: "OpenStreetMap contributors",
        tiles: [{
          tileId: "10-20",
          bounds: { minLon: -80, minLat: 40, maxLon: -79, maxLat: 41 },
          bytes: tileBytes.byteLength,
          sha256: tileSha,
          nodeCount: 2,
          edgeCount: 1
        }],
        tileByteTotal: tileBytes.byteLength
      })
    )
    process.env.SWITCHBACK_OFFLINE_REGION_ROOT = root
  })

  afterEach(() => {
    if (previousRoot === undefined) delete process.env.SWITCHBACK_OFFLINE_REGION_ROOT
    else process.env.SWITCHBACK_OFFLINE_REGION_ROOT = previousRoot
  })

  it("serves the active validated manifest without exposing its disk path", async () => {
    const response = await getManifest(new Request("http://localhost/api/offline/regions/pennsylvania/manifest"), {
      params: Promise.resolve({ regionId: "pennsylvania" })
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("no-cache")
    expect(response.headers.get("x-switchback-source-path")).toBeNull()
    await expect(response.json()).resolves.toMatchObject({ version: "v-test", schemaVersion: 2 })
  })

  it("rejects traversal identifiers before touching the filesystem", async () => {
    const response = await getManifest(new Request("http://localhost"), {
      params: Promise.resolve({ regionId: "../secret" })
    })
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain(root)
  })

  it("serves immutable tiles with ETag and byte-range support", async () => {
    const response = await getTile(new Request("http://localhost/api/tile", {
      headers: { Range: "bytes=2-5" }
    }), {
      params: Promise.resolve({ regionId: "pennsylvania", tileId: "10-20" })
    })
    expect(response.status).toBe(206)
    expect(response.headers.get("etag")).toBe(`"sha256-${tileSha}"`)
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10")
    expect(await response.text()).toBe("2345")
  })

  it("returns 304 for a matching tile ETag and no body for HEAD", async () => {
    const etag = `"sha256-${tileSha}"`
    const notModified = await getTile(new Request("http://localhost/api/tile", {
      headers: { "If-None-Match": etag }
    }), {
      params: Promise.resolve({ regionId: "pennsylvania", tileId: "10-20" })
    })
    expect(notModified.status).toBe(304)

    const head = await headTile(new Request("http://localhost/api/tile"), {
      params: Promise.resolve({ regionId: "pennsylvania", tileId: "10-20" })
    })
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()
    expect(head.headers.get("content-length")).toBe("10")
  })

  it("returns range-not-satisfiable and never serves an unlisted tile", async () => {
    const badRange = await getTile(new Request("http://localhost/api/tile", {
      headers: { Range: "bytes=20-30" }
    }), {
      params: Promise.resolve({ regionId: "pennsylvania", tileId: "10-20" })
    })
    expect(badRange.status).toBe(416)
    expect(badRange.headers.get("content-range")).toBe("bytes */10")

    const missing = await getTile(new Request("http://localhost/api/tile"), {
      params: Promise.resolve({ regionId: "pennsylvania", tileId: "not-in-manifest" })
    })
    expect(missing.status).toBe(404)
  })
})
