import { describe, expect, it } from "vitest"
import type { ProjectGpxCatalog, ProjectGpxRouteSummary } from "@/lib/gpx/catalog"

function projectRoute(
  id: string,
  name: string,
  sourceProject: string,
  sourceFile: string,
  overrides: Partial<ProjectGpxRouteSummary> = {}
): ProjectGpxRouteSummary {
  return {
    id,
    name,
    distanceMiles: 107,
    durationMinutes: 160,
    twistiness: 81,
    turnCount: 84,
    sourceProject,
    sourceFile,
    sources: [sourceFile],
    ...overrides
  }
}

/**
 * Builds a deterministic synthetic catalog with `entryCount` unique routes.
 * The real production catalog lives under the gitignored `data/` directory
 * and is not available in CI or on fresh clones, so the grouping guarantee
 * is asserted against an equivalent generated set instead. Routes are
 * generated in same-normalized-name pairs (a source project + its
 * rideplanner variant), mirroring the production catalog's berks-discovery
 * pattern, so grouping must collapse them.
 */
function buildCatalog(entryCount: number): ProjectGpxCatalog {
  return {
    routes: Array.from({ length: entryCount }, (_, index) => {
      const number = String(Math.floor(index / 2) + 1).padStart(3, "0")
      const isRideplannerVariant = index % 2 === 1
      const sourceProject = isRideplannerVariant ? "rideplanner" : "Roost"
      const name = `Catalog Route ${number}`
      const sourceFile = isRideplannerVariant
        ? `rideplanner/output/gpx/catalog-route-${number}-gaia_high_detail.gpx`
        : `Roost/roostlocker_gpx/catalog/route-${number}.gpx`
      return projectRoute(
        `route-${String(index + 1).padStart(3, "0")}`,
        name,
        sourceProject,
        sourceFile
      )
    })
  }
}

describe("project GPX library view model", () => {
  it("provides a pure library builder", async () => {
    const libraryModule = await import("@/lib/gpx/library-view-model").catch(() => ({
      buildProjectRouteLibrary: undefined
    }))

    expect(libraryModule.buildProjectRouteLibrary).toBeTypeOf("function")
  })

  it("collapses normalized duplicate variants while retaining every member id", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute(
        "berks-roost",
        "2022 Berks County Discovery Route",
        "Roost",
        "Roost/roostlocker_gpx/SE_PA/2022_Berks_County_Discovery_Route.gpx"
      ),
      projectRoute(
        "berks-longway",
        "2022 berks-county-discovery-route",
        "LongWay",
        "LongWay/public/gpx/berks county discovery route v2.gpx"
      ),
      projectRoute(
        "berks-planner",
        "2022 BERKS COUNTY DISCOVERY ROUTE (Track)",
        "rideplanner",
        "rideplanner/output/gpx/2022-berks-county-discovery-route-gaia_high_detail.gpx"
      )
    ]

    const library = buildProjectRouteLibrary(routes)

    expect(library.totalRoutes).toBe(3)
    expect(library.groups).toHaveLength(1)
    expect(library.groups[0]).toMatchObject({
      normalizedName: "2022 berks county discovery",
      region: "southeast-pa",
      count: 3,
      memberIds: ["berks-roost", "berks-longway", "berks-planner"],
      sourceProjects: ["LongWay", "rideplanner", "Roost"]
    })
    expect(library.groups[0].members).toEqual(routes)
  })

  it("uses measured duplicate families even when names differ", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute("family-a", "Imported GPX", "Roost", "Roost/a.gpx", {
        duplicateFamilyId: "family-1",
        duplicateFamilySize: 2,
        duplicateFamilyRole: "canonical"
      }),
      projectRoute("family-b", "Different export name", "LongWay", "LongWay/b.gpx", {
        duplicateFamilyId: "family-1",
        duplicateFamilySize: 2,
        duplicateFamilyRole: "near-duplicate"
      })
    ]

    const library = buildProjectRouteLibrary(routes)

    expect(library.groups).toHaveLength(1)
    expect(library.groups[0]?.memberIds).toEqual(["family-a", "family-b"])
  })

  it("keeps unrelated routes with generic imported names in separate groups", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute(
        "import-1",
        "Imported GPX",
        "rideplanner",
        "rideplanner/output/gpx/imported-gpx-11111111-gaia_high_detail.gpx",
        { distanceMiles: 42 }
      ),
      projectRoute(
        "import-2",
        "Imported GPX",
        "rideplanner",
        "rideplanner/output/gpx/imported-gpx-22222222-gaia_high_detail.gpx",
        { distanceMiles: 180 }
      ),
      projectRoute(
        "track-1",
        "Track",
        "Roost",
        "Roost/roostlocker_gpx/SW_PA/Pittsburgh-PA-380-Mile-Loop.gpx",
        { distanceMiles: 380 }
      )
    ]

    const library = buildProjectRouteLibrary(routes)

    expect(library.groups).toHaveLength(3)
    expect(library.groups.map((group) => group.memberIds)).toEqual([
      ["import-1"],
      ["import-2"],
      ["track-1"]
    ])
  })

  it("derives useful Pennsylvania region, riding profile, and surface hints", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute("york", "York Gravel Loop 155m", "Titan", "Titan/routes/york-gravel.gpx"),
      projectRoute("bald-eagle", "Bald Eagle Dual Sport Loop", "LongWay", "LongWay/bald-eagle.gpx"),
      projectRoute("shamokin", "Shamokin 200 Twisty Street Ride", "LongWay", "LongWay/shamokin.gpx")
    ]

    const library = buildProjectRouteLibrary(routes)

    expect(library.groups.map(({ memberIds, region, profile, surface }) => ({
      id: memberIds[0],
      region,
      profile,
      surface
    }))).toEqual([
      { id: "york", region: "southeast-pa", profile: "adventure", surface: "unpaved" },
      { id: "bald-eagle", region: "central-pa", profile: "adventure", surface: "mixed" },
      { id: "shamokin", region: "central-pa", profile: "twisty", surface: "paved" }
    ])
  })

  it("searches normalized names, inferred regions, source projects, and source files", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute(
        "berks",
        "Berks-County_Discovery Route",
        "Roost",
        "Roost/roostlocker_gpx/SE_PA/berks-discovery.gpx"
      ),
      projectRoute("bald-eagle", "Bald Eagle Dual Sport Loop", "LongWay", "LongWay/bald-eagle.gpx")
    ]

    const library = buildProjectRouteLibrary(routes, { query: "southeast roost discovery" })

    expect(library.groups.map((group) => group.memberIds)).toEqual([["berks"]])
    expect(library.visibleRoutes).toBe(1)
  })

  it("filters route groups by any contributing source project", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute("berks-roost", "Berks Discovery", "Roost", "Roost/SE_PA/berks.gpx"),
      projectRoute("berks-longway", "berks-discovery", "LongWay", "LongWay/berks.gpx"),
      projectRoute("generated", "Algorithmic Fallback 66mi", "rideplanner", "rideplanner/fallback.gpx")
    ]

    const library = buildProjectRouteLibrary(routes, { source: "roost" })

    expect(library.groups.map((group) => group.memberIds)).toEqual([
      ["berks-roost", "berks-longway"]
    ])
    expect(library.visibleRoutes).toBe(2)
  })

  it("combines inferred profile and surface filters", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute("gravel", "York Gravel Loop", "Titan", "Titan/york.gpx"),
      projectRoute("dual-sport", "Bald Eagle Dual Sport Loop", "LongWay", "LongWay/bald-eagle.gpx"),
      projectRoute("twisty", "Shamokin Twisty Street Ride", "LongWay", "LongWay/shamokin.gpx")
    ]

    const library = buildProjectRouteLibrary(routes, {
      profile: "adventure",
      surface: "unpaved"
    })

    expect(library.groups.map((group) => group.memberIds)).toEqual([["gravel"]])
  })

  it("can surface route groups with the most duplicate variants first", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute("alpha", "Alpha Loop", "LongWay", "LongWay/alpha.gpx"),
      projectRoute("zulu-1", "Zulu Loop", "Roost", "Roost/zulu.gpx"),
      projectRoute("zulu-2", "zulu-loop", "rideplanner", "rideplanner/zulu.gpx")
    ]

    const library = buildProjectRouteLibrary(routes, { sort: "variants-desc" })

    expect(library.groups.map((group) => group.memberIds)).toEqual([
      ["zulu-1", "zulu-2"],
      ["alpha"]
    ])
  })

  it("sorts route groups by longest representative distance", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute("short", "Short Loop", "LongWay", "LongWay/short.gpx", { distanceMiles: 32 }),
      projectRoute("long", "Long Loop", "Roost", "Roost/long.gpx", { distanceMiles: 180 })
    ]

    const library = buildProjectRouteLibrary(routes, { sort: "distance-desc" })

    expect(library.groups.map((group) => group.memberIds[0])).toEqual(["long", "short"])
  })

  it("sorts route groups by highest representative twistiness", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute("mellow", "Mellow Loop", "LongWay", "LongWay/mellow.gpx", { twistiness: 34 }),
      projectRoute("twisty", "Twisty Loop", "Roost", "Roost/twisty.gpx", { twistiness: 96 })
    ]

    const library = buildProjectRouteLibrary(routes, { sort: "twistiness-desc" })

    expect(library.groups.map((group) => group.memberIds[0])).toEqual(["twisty", "mellow"])
  })

  it("sorts route groups alphabetically by normalized display name", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute("zulu", "Zulu Loop", "Roost", "Roost/zulu.gpx"),
      projectRoute("alpha", "alpha-loop", "LongWay", "LongWay/alpha.gpx")
    ]

    const library = buildProjectRouteLibrary(routes, { sort: "name" })

    expect(library.groups.map((group) => group.memberIds[0])).toEqual(["alpha", "zulu"])
  })

  it("organizes visible groups into regional sections with group and route totals", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute("berks-1", "Berks Discovery", "Roost", "Roost/SE_PA/berks.gpx"),
      projectRoute("berks-2", "berks-discovery", "LongWay", "LongWay/berks.gpx"),
      projectRoute("york", "York Gravel Loop", "Titan", "Titan/york.gpx"),
      projectRoute("bald-eagle", "Bald Eagle Dual Sport Loop", "LongWay", "LongWay/bald-eagle.gpx")
    ]

    const library = buildProjectRouteLibrary(routes, { sort: "name" })

    expect(library.sections.map(({ region, label, groupCount, routeCount, groups }) => ({
      region,
      label,
      groupCount,
      routeCount,
      ids: groups.flatMap((group) => group.memberIds)
    }))).toEqual([
      {
        region: "southeast-pa",
        label: "Southeast PA",
        groupCount: 2,
        routeCount: 3,
        ids: ["berks-1", "berks-2", "york"]
      },
      {
        region: "central-pa",
        label: "Central PA",
        groupCount: 1,
        routeCount: 1,
        ids: ["bald-eagle"]
      }
    ])
  })

  it("exposes stable source, profile, and surface facets for filter controls", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute("gravel", "York Gravel Loop", "Titan", "Titan/york.gpx"),
      projectRoute("dual-sport", "Bald Eagle Dual Sport Loop", "LongWay", "LongWay/bald-eagle.gpx"),
      projectRoute("twisty", "Shamokin Twisty Street Ride", "Roost", "Roost/shamokin.gpx")
    ]

    const library = buildProjectRouteLibrary(routes)

    expect(library.facets).toEqual({
      sources: ["LongWay", "Roost", "Titan"],
      profiles: ["adventure", "twisty"],
      surfaces: ["unpaved", "mixed", "paved"]
    })
  })

  it("reports grouped totals without losing any catalog entries", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    // 419 mirrors the size of the production catalog; the assertion holds
    // for any entry set because grouping must never drop or duplicate ids.
    const catalog = buildCatalog(419)

    const library = buildProjectRouteLibrary(catalog.routes)
    const groupedIds = library.groups.flatMap((group) => group.memberIds)

    expect(library.totalRoutes).toBe(419)
    expect(library.totalGroups).toBeLessThan(419)
    expect(groupedIds).toHaveLength(419)
    expect(new Set(groupedIds).size).toBe(419)
    expect(groupedIds.toSorted()).toEqual(catalog.routes.map((route) => route.id).toSorted())
  })

  it("chooses a project-original member over a generated rideplanner variant", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute(
        "generated",
        "2022 berks-county-discovery-route",
        "rideplanner",
        "rideplanner/output/gpx/2022-berks-county-discovery-route-gaia_high_detail.gpx"
      ),
      projectRoute(
        "original",
        "2022 Berks County Discovery Route",
        "Roost",
        "Roost/roostlocker_gpx/SE_PA/2022_Berks_County_Discovery_Route.gpx"
      )
    ]

    const [group] = buildProjectRouteLibrary(routes).groups

    expect(group.representative.id).toBe("original")
    expect(group.name).toBe("2022 Berks County Discovery Route")
    expect(group.memberIds).toEqual(["generated", "original"])
  })

  it("does not throw when sourceFile and sources are absent (public /api/gpx-library redacts them)", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes: ProjectGpxRouteSummary[] = [
      {
        id: "public-1",
        name: "York Gravel Loop",
        distanceMiles: 42,
        durationMinutes: 90,
        twistiness: 60,
        turnCount: 40,
        sourceProject: "Titan"
      },
      {
        id: "public-2",
        name: "Bald Eagle Dual Sport Loop",
        distanceMiles: 55,
        durationMinutes: 110,
        twistiness: 70,
        turnCount: 50,
        sourceProject: "LongWay"
      }
    ]

    const library = buildProjectRouteLibrary(routes, { query: "gravel" })

    expect(library.totalRoutes).toBe(2)
    expect(library.groups.map((group) => group.memberIds)).toEqual([["public-1"]])
  })

  it("prefers an explicit canonical region folder over generated filename guesses", async () => {
    const { buildProjectRouteLibrary } = await import("@/lib/gpx/library-view-model")
    const routes = [
      projectRoute(
        "generated",
        "Bikes only sta",
        "rideplanner",
        "rideplanner/output/gpx/allegheny-bikes-only-sta-gaia_high_detail.gpx"
      ),
      projectRoute(
        "original",
        "Bikes only sta",
        "Roost",
        "Roost/roostlocker_gpx/NW_PA/Bikes-only-sta.gpx"
      )
    ]

    const [group] = buildProjectRouteLibrary(routes).groups

    expect(group.representative.id).toBe("original")
    expect(group.region).toBe("northwest-pa")
  })
})
