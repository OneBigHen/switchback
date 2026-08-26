import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { handleGpxCatalogRequest } from "@/app/api/gpx-library/handler"

const tempDirsOriginal: string[] = []

afterEach(async () => {
  await Promise.all(tempDirsOriginal.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("project GPX catalog API (original contract", () => {
  it("lists imported route metadata and loads an allowed route", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "switchback-gpx-"))
    tempDirsOriginal.push(root)
    await mkdir(path.join(root, "routes"))
    const metadata = { id: "project-gpx-abc123", name: "Ridge Run", distanceMiles: 42 }
    const route = { ...metadata, geometry: [[-76, 40], [-76.1, 40.1]] }
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({
      scannedFiles: 2,
      uniqueFiles: 1,
      importedRoutes: 1,
      rejectedFiles: 0,
      routes: [metadata]
    }))
    await writeFile(path.join(root, "routes", `${metadata.id}.json`), JSON.stringify(route))

    const listing = await handleGpxCatalogRequest(new Request("http://switchback.test/api/gpx-library"), root)
    expect(listing.status).toBe(200)
    await expect(listing.json()).resolves.toMatchObject({ importedRoutes: 1, routes: [metadata] })

    const loaded = await handleGpxCatalogRequest(
      new Request(`http://switchback.test/api/gpx-library?id=${metadata.id}`),
      root
    )
    expect(loaded.status).toBe(200)
    await expect(loaded.json()).resolves.toMatchObject(route)
  })

  it("rejects route ids that are not present in the manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "switchback-gpx-"))
    tempDirsOriginal.push(root)
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({ routes: [] }))

    const response = await handleGpxCatalogRequest(
      new Request("http://switchback.test/api/gpx-library?id=../../etc/passwd"),
      root
    )

    expect(response.status).toBe(404)
  })

  it("strips host filesystem paths from the public catalog listing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "switchback-gpx-"))
    tempDirsOriginal.push(root)
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({
      routes: [{
        id: "route-1",
        name: "Ridge Run",
        distanceMiles: 42,
        sourceProject: "Titan",
        sourceFile: "/root/Vibe/switchback/data/gpx-library/Titan/12-10/ridge.gpx",
        sources: ["/root/Vibe/switchback/data/gpx-library/Titan/12-10/ridge.gpx"]
      }]
    }))

    const response = await handleGpxCatalogRequest(new Request("http://switchback.test/api/gpx-library"), root)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.routes[0].sourceFile).toBeUndefined()
    expect(body.routes[0].sources).toBeUndefined()
    expect(body.routes[0].sourceProject).toBe("Titan")
  })

  it("rejects oversized or malformed route ids", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "switchback-gpx-"))
    tempDirsOriginal.push(root)
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({ routes: [{ id: "ok" }] }))

    const oversized = await handleGpxCatalogRequest(
      new Request(`http://switchback.test/api/gpx-library?id=${"a".repeat(300)}`),
      root
    )
    expect(oversized.status).toBe(404)

    const malformed = await handleGpxCatalogRequest(
      new Request("http://switchback.test/api/gpx-library?id=bad%2F..%2Fname"),
      root
    )
    expect(malformed.status).toBe(404)
  })
})
