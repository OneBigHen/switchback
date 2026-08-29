import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { handleGpxCatalogRequest } from "@/app/api/gpx-library/handler"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function makeCatalog(routes: unknown[], routeDetail?: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "switchback-atlas-"))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, "routes"))
  await writeFile(path.join(root, "manifest.json"), JSON.stringify({ routes }))
  if (routeDetail) {
    await writeFile(path.join(root, "routes", `${(routes[0] as { id: string }).id}.json`), JSON.stringify(routeDetail))
  }
  return root
}

describe("atlas-extended GPX catalog API", () => {
  it("adds a story and poster flag to every listed route without leaking paths", async () => {
    const root = await makeCatalog([
      {
        id: "project-gpx-abc123",
        name: "Ridge Run",
        distanceMiles: 42,
        durationMinutes: 90,
        twistiness: 72,
        turnCount: 88,
        sourceProject: "rideplanner",
        sourceFile: "/root/Vibe/secret.gpx"
      }
    ])

    const listing = await handleGpxCatalogRequest(new Request("http://switchback.test/api/gpx-library"), root)
    expect(listing.status).toBe(200)
    const body = await listing.json()
    const route = body.routes[0]
    expect(route.story.tone).toBe("Day loop")
    expect(route.story.body).toContain("42 miles")
    expect(route.art).toBe(false)
    expect(JSON.stringify(body)).not.toContain("/root/Vibe")
    expect(JSON.stringify(body)).not.toContain("sourceFile")
  })

  it("detail payload keeps geometry and adds story + poster metadata", async () => {
    const detail = {
      id: "project-gpx-abc123",
      name: "Ridge Run",
      distanceMiles: 42,
      durationMinutes: 90,
      twistiness: 72,
      turnCount: 88,
      geometry: [[-76, 40], [-76.01, 40.01], [-76.02, 40.0]]
    }
    const root = await makeCatalog([{ id: detail.id, name: detail.name }], detail)
    const response = await handleGpxCatalogRequest(
      new Request(`http://switchback.test/api/gpx-library?id=${detail.id}`),
      root
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.geometry)).toBe(true)
    expect(body.story.title).toBe("Ridge Run")
    expect(body.poster).toBeNull()
  })

  it("redacts import bookkeeping and host paths from the public detail payload", async () => {
    const detail = {
      id: "project-gpx-abc123",
      name: "Ridge Run",
      distanceMiles: 42,
      durationMinutes: 90,
      twistiness: 72,
      turnCount: 88,
      geometry: [[-76, 40], [-76.01, 40.01]],
      waypoints: [],
      instructions: [],
      navigationMode: "track-only",
      // Everything below is server-side import bookkeeping.
      sourceFiles: ["rideplanner/output/gpx/imported-gpx-8a77bc9d-gaia_high_detail.gpx"],
      sourceContentSha256: "5f0c1d2e",
      ingest: { sourceFormat: "gpx", segmentCount: 1 },
      mapMatch: { status: "not-configured", message: "No GraphHopper map-matching endpoint is configured." }
    }
    const root = await makeCatalog([{ id: detail.id, name: detail.name }], detail)
    const response = await handleGpxCatalogRequest(
      new Request(`http://switchback.test/api/gpx-library?id=${detail.id}`),
      root
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    // The rider-facing contract survives...
    expect(body.id).toBe(detail.id)
    expect(body.geometry).toEqual(detail.geometry)
    expect(body.navigationMode).toBe("track-only")
    expect(body.story.title).toBe("Ridge Run")
    // ...while the import bookkeeping does not.
    expect(body.sourceFiles).toBeUndefined()
    expect(body.sourceContentSha256).toBeUndefined()
    expect(body.ingest).toBeUndefined()
    expect(body.mapMatch).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain("rideplanner/output")
  })

  it("still rejects unknown route ids", async () => {
    const root = await makeCatalog([])
    const response = await handleGpxCatalogRequest(
      new Request("http://switchback.test/api/gpx-library?id=nope"),
      root
    )
    expect(response.status).toBe(404)
  })
})
