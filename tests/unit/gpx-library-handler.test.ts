import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { handleGpxCatalogRequest } from "@/app/api/gpx-library/handler"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function catalogRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "switchback-gpx-catalog-"))
  roots.push(root)
  await writeFile(path.join(root, "manifest.json"), JSON.stringify({
    generatedAt: "2026-09-09T12:00:00.000Z",
    routes: [{
      id: "bald-eagle",
      name: "Bald Eagle Dual Sport Loop",
      distanceMiles: 104.7,
      durationMinutes: 0,
      twistiness: 62,
      turnCount: 118,
      sourceProject: "rideplanner",
      duplicateFamilyId: "bald-eagle-family",
      duplicateFamilySize: 3,
      duplicateFamilyRole: "canonical"
    }, {
      id: "bald-eagle-copy",
      name: "Bald Eagle Dual Sport Loop",
      distanceMiles: 104.7,
      durationMinutes: 0,
      twistiness: 62,
      turnCount: 118,
      sourceProject: "Titan",
      duplicateFamilyId: "bald-eagle-family",
      duplicateFamilySize: 3,
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
  return root
}

describe("GPX catalog listing for Rides", () => {
  it("returns grounded stories, duplicate truth, and lightweight real route paths", async () => {
    const root = await catalogRoot()
    const response = await handleGpxCatalogRequest(new Request("http://switchback.test/api/gpx-library"), root)
    const body = await response.json() as { routes: Array<Record<string, unknown>> }

    expect(response.status).toBe(200)
    expect(body.routes[0]).toMatchObject({
      id: "bald-eagle",
      durationMinutes: 0,
      duplicateFamilyId: "bald-eagle-family",
      duplicateFamilyRole: "canonical",
      bbox: [-77.9, 40.75, -77.25, 41.1],
      story: {
        title: "Bald Eagle Dual Sport Loop"
      },
      preview: {
        paths: ["M8 110 L35 60 L76 82 L92 12"],
        start: [8, 110],
        end: [92, 12]
      }
    })
    expect(body.routes[1]).toMatchObject({
      id: "bald-eagle-copy",
      duplicateOf: "bald-eagle"
    })
    expect(body.routes[1]).not.toHaveProperty("preview")
  })

  it("lets non-visual catalog consumers opt out of preview paths", async () => {
    const root = await catalogRoot()
    const response = await handleGpxCatalogRequest(new Request("http://switchback.test/api/gpx-library?preview=0"), root)
    const body = await response.json() as { routes: Array<Record<string, unknown>> }

    expect(body.routes[0]).not.toHaveProperty("preview")
    expect(body.routes[0]).toHaveProperty("story")
    expect(body.routes[0]).toHaveProperty("bbox")
  })
})
