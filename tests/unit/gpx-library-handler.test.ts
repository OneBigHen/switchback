import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { handleGpxCatalogRequest } from "@/app/api/gpx-library/handler"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const baldEagleDetail = {
  id: "bald-eagle",
  name: "000 Bald Eagle Dual Sport Loop - created by someone on ADVHub.net",
  profile: "motorcycle",
  distanceMiles: 104.7,
  durationMinutes: 0,
  twistiness: 62,
  turnCount: 118,
  geometry: [[-77.9, 40.75], [-77.5, 40.9], [-77.25, 41.1]],
  waypoints: [],
  instructions: [],
  previewOnly: false,
  sourceFiles: ["/root/Vibe/switchback/data/gpx-library/rideplanner/bald-eagle.gpx"]
}

async function catalogRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "opengravel-gpx-catalog-"))
  roots.push(root)
  await mkdir(path.join(root, "routes"))
  await writeFile(path.join(root, "manifest.json"), JSON.stringify({
    generatedAt: "2026-09-09T12:00:00.000Z",
    routes: [{
      id: "bald-eagle",
      name: baldEagleDetail.name,
      distanceMiles: 104.7,
      durationMinutes: 0,
      twistiness: 62,
      turnCount: 118,
      sourceProject: "rideplanner",
      sourceFile: "/root/Vibe/switchback/data/gpx-library/rideplanner/bald-eagle.gpx",
      duplicateFamilyId: "bald-eagle-family",
      duplicateFamilySize: 2,
      duplicateFamilyRole: "canonical"
    }, {
      id: "bald-eagle-copy",
      name: "Bald Eagle Dual Sport Loop",
      distanceMiles: 104.7,
      durationMinutes: 188,
      twistiness: 62,
      turnCount: 118,
      sourceProject: "Titan",
      duplicateFamilyId: "bald-eagle-family",
      duplicateFamilySize: 2,
      duplicateFamilyRole: "near-duplicate"
    }]
  }))
  await writeFile(path.join(root, "atlas.json"), JSON.stringify({
    version: 1,
    routes: {
      "bald-eagle": {
        aspect: 1.2,
        bbox: [-77.9, 40.75, -77.25, 41.1],
        paths: [{ band: "twisty", d: "M8 110 L35 60 L76 82 L92 12" }],
        start: [8, 110],
        end: [92, 12]
      },
      "bald-eagle-copy": {
        aspect: 1.2,
        bbox: [-77.9, 40.75, -77.25, 41.1],
        paths: [{ band: "twisty", d: "M8 110 L35 60 L76 82 L92 12" }],
        duplicateOf: "bald-eagle"
      }
    }
  }))
  await writeFile(path.join(root, "routes", "bald-eagle.json"), JSON.stringify(baldEagleDetail))
  return root
}

describe("Route Library catalog listing", () => {
  it("keeps the default listing lightweight: no geometry, waypoints, instructions, source files or preview paths", async () => {
    const root = await catalogRoot()
    const response = await handleGpxCatalogRequest(new Request("http://opengravel.test/api/gpx-library"), root)
    const body = await response.json() as { routes: Array<Record<string, unknown>> }

    expect(response.status).toBe(200)
    for (const route of body.routes) {
      expect(route).not.toHaveProperty("geometry")
      expect(route).not.toHaveProperty("waypoints")
      expect(route).not.toHaveProperty("instructions")
      expect(route).not.toHaveProperty("sourceFile")
      expect(route).not.toHaveProperty("sources")
      expect(route).not.toHaveProperty("preview")
      expect(route).not.toHaveProperty("paths")
    }
    expect(JSON.stringify(body)).not.toContain("/root/Vibe")
  })

  it("serves cleaned rider-facing names and unknown duration as null, never 0", async () => {
    const root = await catalogRoot()
    const response = await handleGpxCatalogRequest(new Request("http://opengravel.test/api/gpx-library"), root)
    const body = await response.json() as { routes: Array<Record<string, unknown>> }

    expect(body.routes[0]).toMatchObject({
      id: "bald-eagle",
      name: "Bald Eagle Dual Sport Loop",
      durationMinutes: null,
      story: { title: "Bald Eagle Dual Sport Loop" }
    })
    expect(JSON.stringify(body.routes[0]!.story)).not.toMatch(/\bmin\b|\bhr\b/)
    expect(body.routes[1]).toMatchObject({ id: "bald-eagle-copy", durationMinutes: 188 })
  })

  it("files every placeable route with reusable bbox-derived region and riding-area metadata", async () => {
    const root = await catalogRoot()
    const response = await handleGpxCatalogRequest(new Request("http://opengravel.test/api/gpx-library"), root)
    const body = await response.json() as { routes: Array<Record<string, unknown>> }

    expect(body.routes[0]).toMatchObject({
      bbox: [-77.9, 40.75, -77.25, 41.1],
      area: { region: "North-Central PA", ridingAreas: ["PA Wilds", "Bald Eagle / Rothrock"] }
    })
  })

  it("carries duplicate-family truth so clients can collapse repeats", async () => {
    const root = await catalogRoot()
    const response = await handleGpxCatalogRequest(new Request("http://opengravel.test/api/gpx-library"), root)
    const body = await response.json() as { routes: Array<Record<string, unknown>> }

    expect(body.routes[0]).toMatchObject({
      duplicateFamilyId: "bald-eagle-family",
      duplicateFamilySize: 2,
      duplicateFamilyRole: "canonical"
    })
    expect(body.routes[0]).not.toHaveProperty("duplicateOf")
    expect(body.routes[1]).toMatchObject({
      duplicateFamilyRole: "near-duplicate",
      duplicateOf: "bald-eagle"
    })
  })
})

describe("Route Library catalog detail", () => {
  it("keeps full allow-listed geometry on the detail path with a grounded story and catalog presentation", async () => {
    const root = await catalogRoot()
    const response = await handleGpxCatalogRequest(new Request("http://opengravel.test/api/gpx-library?id=bald-eagle"), root)
    const body = await response.json() as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.geometry).toEqual(baldEagleDetail.geometry)
    // The detail record is what Open in Planner / Save to My Rides consume, so
    // the rider-facing name is already clean there too.
    expect(body.name).toBe("Bald Eagle Dual Sport Loop")
    expect(body.story).toMatchObject({ title: "Bald Eagle Dual Sport Loop" })
    expect(JSON.stringify(body.story)).not.toMatch(/\bmin\b|\bhr\b/)
    expect(body.catalog).toEqual({
      durationMinutes: null,
      area: { region: "North-Central PA", ridingAreas: ["PA Wilds", "Bald Eagle / Rothrock"] }
    })
    expect(body).not.toHaveProperty("sourceFiles")
  })
})
