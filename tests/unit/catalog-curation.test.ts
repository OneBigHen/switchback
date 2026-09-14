import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { AtlasRouteArt } from "@/lib/gpx/atlas"
import {
  catalogExclusionReason,
  catalogExclusions,
  humanSourceName,
  isFixtureSourcePath,
  timestampNameDate
} from "@/lib/gpx/catalog-curation"
import { buildAtlasBrowseRoutes, catalogCurvatureBands, type AtlasListingRoute } from "@/app/gpx-library/atlas-listing"
import { buildRouteStory } from "@/lib/gpx/route-story"
import { curateGpxLibrary } from "../../scripts/curate-gpx-library"

function row(over: Partial<AtlasListingRoute> & { id: string }): AtlasListingRoute {
  return {
    name: "Bald Eagle Loop",
    distanceMiles: 80,
    durationMinutes: 0,
    twistiness: 100,
    turnCount: 400,
    sourceProject: "rideplanner",
    sourceFile: "rideplanner/output/gpx/bald-eagle-loop.gpx",
    ...over
  }
}

const art: AtlasRouteArt = { aspect: 1, bbox: [-77.9, 40.75, -77.25, 41.1], paths: [{ band: "twisty", d: "M0 0 L10 10" }] }
const artFor = (routes: readonly { id: string }[]) => Object.fromEntries(routes.map((route) => [route.id, art]))

describe("catalog curation rules", () => {
  it("rejects other projects' test fixtures, but not a real ride that also has a fixture copy", () => {
    expect(isFixtureSourcePath("planning-skill/gpx.studio/gpx/test-data/simple.gpx")).toBe(true)
    expect(isFixtureSourcePath("LongWay/playwright/fixtures/overlays/sample.gpx")).toBe(true)
    expect(isFixtureSourcePath("data/gpx-library.previous-1757000000/originals/a.gpx")).toBe(true)
    expect(isFixtureSourcePath("LongWay/public/gpx/deer_season_roads.gpx")).toBe(false)

    expect(catalogExclusionReason(row({ id: "f", sourceFile: "x/test-data/simple.gpx", sources: ["x/test-data/simple.gpx"] })))
      .toBe("fixture-source")
    expect(catalogExclusionReason(row({ id: "r", sources: ["x/test-data/copy.gpx", "LongWay/public/gpx/real.gpx"] })))
      .toBeNull()
  })

  it("rejects exports far shorter than the ride their name describes", () => {
    expect(catalogExclusionReason(row({ id: "a", name: "Scenic Route - 84mi", distanceMiles: 1.07 }))).toBe("preview-export")
    expect(catalogExclusionReason(row({ id: "b", name: "Curvy Preview - 126mi", distanceMiles: 1.2 }))).toBe("preview-export")
    // Longer than promised, or close to it, is a ride.
    expect(catalogExclusionReason(row({ id: "c", name: "Curvy Route - 42mi", distanceMiles: 69 }))).toBeNull()
    expect(catalogExclusionReason(row({ id: "d", name: "Leaser Lake Street Route 140 Miles", distanceMiles: 139 }))).toBeNull()
  })

  it("judges a split part against the whole file its name describes", () => {
    const parts = [
      row({ id: "file--t1", name: "Twisty Loop - 126mi", distanceMiles: 32 }),
      row({ id: "file--t2", name: "Twisty Loop - 126mi", distanceMiles: 79 })
    ]
    expect(catalogExclusions(parts)).toEqual([])
    expect(catalogExclusionReason(parts[0]!)).toBe("preview-export")
  })

  it("rejects empty tracks and split slivers, keeps short rides that are whole files", () => {
    expect(catalogExclusionReason(row({ id: "e", distanceMiles: 0.3 }))).toBe("empty-track")
    expect(catalogExclusionReason(row({ id: "file--t3", name: "Optional Creek Crossing", distanceMiles: 2.8 }))).toBe("split-fragment")
    expect(catalogExclusionReason(row({ id: "file--t4", name: "Day 2", distanceMiles: 22 }))).toBeNull()
    expect(catalogExclusionReason(row({ id: "whole", name: "New Zoo Review", distanceMiles: 5 }))).toBeNull()
    expect(catalogExclusionReason(row({ id: "t", name: "Test Route", distanceMiles: 20 }))).toBe("placeholder-name")
  })

  it("recovers readable names from source files and dates from timestamp names", () => {
    expect(humanSourceName(["rideplanner/output/gpx/imported-gpx-52fb0ec6-gaia_high_detail.gpx", "Titan/Downingtown_jaunt.gpx"]))
      .toBe("Downingtown jaunt")
    expect(humanSourceName(["x/new.gpx", "x/Track_2.gpx"])).toBeNull()
    expect(timestampNameDate("2016-07-23 08:58:57")).toBe("Jul 23, 2016")
    expect(timestampNameDate("2016-13-40")).toBeNull()
    expect(timestampNameDate("Polar Bear Ride 01/23/21")).toBeNull()
  })
})

describe("catalog cards you can tell apart", () => {
  it("titles unnamed imports by what and where they are, never 'Imported GPX'", () => {
    const routes = [
      row({ id: "a", name: "Imported GPX", distanceMiles: 88, sourceFile: "rideplanner/output/gpx/imported-gpx-1a2b3c4d.gpx" }),
      row({ id: "b", name: "2016-07-23 08:58:57", distanceMiles: 52, sourceFile: "Titan/2016-07-23.gpx" }),
      row({ id: "c", name: "new", distanceMiles: 40, sourceFile: "Titan/Downingtown_jaunt.gpx" })
    ]
    const titles = buildAtlasBrowseRoutes(routes, artFor(routes)).map((route) => route.title)
    expect(titles).toEqual(["88-mile ride near PA Wilds", "Ride on Jul 23, 2016", "Downingtown jaunt"])
  })

  it("numbers split rides as parts of their file and leaves slivers and fixtures out", () => {
    const routes = [
      row({ id: "file--t1", name: "Armstrong County Loops", distanceMiles: 110 }),
      row({ id: "file--t2", name: "Armstrong County Loops", distanceMiles: 2.8 }),
      row({ id: "file--t3", name: "Armstrong County Loops", distanceMiles: 67 }),
      row({ id: "fixture", name: "with_time", distanceMiles: 20, sourceFile: "x/test-data/with_time.gpx" })
    ]
    const rows = buildAtlasBrowseRoutes(routes, artFor(routes))
    expect(rows.map((route) => [route.id, route.title])).toEqual([
      ["file--t1", "Armstrong County Loops · part 1 of 2"],
      ["file--t3", "Armstrong County Loops · part 2 of 2"]
    ])
  })

  it("files curvature relative to the catalog when the stored score is saturated", () => {
    const routes = Array.from({ length: 8 }, (_, index) =>
      row({ id: `r${index}`, name: `Ride ${index}`, twistiness: 100, distanceMiles: 100, turnCount: 100 * (index + 1) })
    )
    const bands = catalogCurvatureBands(routes)
    expect([...bands.values()]).toEqual(["calm", "calm", "mellow", "mellow", "twisty", "twisty", "hairpin", "hairpin"])
    expect(buildAtlasBrowseRoutes(routes, artFor(routes)).map((route) => route.band)).toEqual([...bands.values()])
    expect(catalogCurvatureBands(routes.slice(0, 4)).size).toBe(0)
  })

  it("title-cases without shouting after apostrophes", () => {
    expect(buildRouteStory({ id: "w", name: "wawa to hermy's", distanceMiles: 65, durationMinutes: 0, twistiness: 40, turnCount: 10 }).title)
      .toBe("Wawa To Hermy's")
  })
})

describe("npm run gpx:curate", () => {
  let root = ""
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  async function library(): Promise<string> {
    root = await mkdtemp(path.join(os.tmpdir(), "gpx-curate-"))
    const routes = [
      row({ id: "keep", name: "Bald Eagle Loop" }),
      row({ id: "fixture", name: "with_time", sourceFile: "x/test-data/with_time.gpx", sources: ["x/test-data/with_time.gpx"] }),
      row({ id: "multi--t1", name: "Armstrong", distanceMiles: 110 }),
      row({ id: "multi--t2", name: "Armstrong", distanceMiles: 2.5 })
    ]
    for (const route of routes) {
      await mkdir(path.join(root, "routes"), { recursive: true })
      await writeFile(path.join(root, "routes", `${route.id}.json`), JSON.stringify({ id: route.id }))
    }
    for (const fileId of ["keep", "fixture", "multi"]) {
      await mkdir(path.join(root, "originals", fileId), { recursive: true })
      await writeFile(path.join(root, "originals", fileId, "001-source.gpx"), "<gpx/>")
    }
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({
      version: 3,
      importedRoutes: routes.length,
      rejectedFiles: 1,
      routes,
      rejected: [{ id: "old", sourceFile: "a.gpx", sources: ["a.gpx"], reason: "Parse error" }]
    }))
    return root
  }

  it("dry-runs by default and changes nothing", async () => {
    const dir = await library()
    const before = await readFile(path.join(dir, "manifest.json"), "utf8")
    const result = await curateGpxLibrary(dir)
    expect(result.applied).toBe(false)
    expect(result.rejected.map((decision) => [decision.id, decision.reason])).toEqual([
      ["fixture", "fixture-source"],
      ["multi--t2", "split-fragment"]
    ])
    expect(await readFile(path.join(dir, "manifest.json"), "utf8")).toBe(before)
    expect((await readdir(path.join(dir, "routes"))).length).toBe(4)
  })

  it("moves rejected routes aside with their reason, keeping originals a remaining ride still needs", async () => {
    const dir = await library()
    const result = await curateGpxLibrary(dir, { apply: true, now: new Date("2026-09-14T00:00:00Z") })
    expect(result).toMatchObject({ applied: true, keptRoutes: 2, movedOriginals: ["fixture"] })

    const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"))
    expect(manifest.routes.map((route: { id: string }) => route.id)).toEqual(["keep", "multi--t1"])
    expect(manifest).toMatchObject({ importedRoutes: 2, rejectedFiles: 3 })
    expect(manifest.rejected.at(-1)).toMatchObject({
      id: "multi--t2",
      curation: "split-fragment",
      curatedAt: "2026-09-14T00:00:00.000Z"
    })

    expect((await readdir(path.join(dir, "routes"))).toSorted()).toEqual(["keep.json", "multi--t1.json"])
    expect(await readdir(path.join(dir, "rejected", "multi--t2"))).toEqual(["route.json"])
    expect((await readdir(path.join(dir, "rejected", "fixture"))).toSorted()).toEqual(["originals", "route.json"])
    expect((await readdir(path.join(dir, "originals"))).toSorted()).toEqual(["keep", "multi"])

    // Running again finds nothing left to curate.
    expect((await curateGpxLibrary(dir, { apply: true })).rejected).toEqual([])
  })
})
