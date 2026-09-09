import { describe, expect, it } from "vitest"
import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import type { SavedRoute } from "@/lib/storage/route-library"
import { normalizeRideLibrary } from "@/components/rides/rides-view-model"

function savedRoute(overrides: Partial<SavedRoute> = {}): SavedRoute {
  return {
    id: "route-1",
    name: "Imported mountain loop",
    folder: "Unfiled",
    tags: [],
    visible: true,
    distanceMiles: 42,
    durationMinutes: 78,
    updatedAt: "2026-09-01T12:00:00.000Z",
    routingSource: "imported",
    ...overrides
  } as SavedRoute
}

function projectRoute(overrides: Partial<ProjectGpxRouteSummary> = {}): ProjectGpxRouteSummary {
  return {
    id: "project-1",
    name: "Bald Eagle Dual Sport Loop",
    distanceMiles: 104.7,
    durationMinutes: 0,
    twistiness: 62,
    turnCount: 118,
    sourceProject: "rideplanner",
    bbox: [-77.9, 40.75, -77.25, 41.1],
    story: {
      title: "Bald Eagle Dual Sport Loop",
      summary: "A solid half-day run that stays nicely twisty start to finish.",
      body: "105 miles, with roughly 118 notable turns.",
      tone: "Half-day run"
    },
    preview: {
      paths: ["M8 110 L35 60 L76 82 L92 12"],
      start: [8, 110],
      end: [92, 12]
    },
    ...overrides
  }
}

describe("normalizeRideLibrary", () => {
  it("preserves imported provenance for saved GPX routes", () => {
    const [item] = normalizeRideLibrary({ savedRoutes: [savedRoute()] })

    expect(item?.kind).toBe("saved-route")
    expect(item?.management?.imported).toBe(true)
  })

  it("does not label normally planned saved routes as imported", () => {
    const [item] = normalizeRideLibrary({
      savedRoutes: [savedRoute({ routingSource: "live" })]
    })

    expect(item?.management?.imported).toBe(false)
  })

  it("carries the real project route story, geography, and atlas shape into Rides", () => {
    const [item] = normalizeRideLibrary({ projectRoutes: [projectRoute()] })

    expect(item?.summary).toBe("A solid half-day run that stays nicely twisty start to finish.")
    expect(item?.macroRegion).toBe("North-Central PA")
    expect(item?.ridingAreas).toContain("Bald Eagle / Rothrock")
    expect(item?.preview?.paths).toEqual(["M8 110 L35 60 L76 82 L92 12"])
  })

  it("folds duplicate project imports to the canonical ride instead of repeating the same route", () => {
    const items = normalizeRideLibrary({
      projectRoutes: [
        projectRoute({
          id: "canonical",
          sourceProject: "LongWay",
          duplicateFamilyId: "bald-eagle-family",
          duplicateFamilyRole: "canonical"
        }),
        projectRoute({
          id: "duplicate",
          sourceProject: "Titan",
          duplicateFamilyId: "bald-eagle-family",
          duplicateFamilyRole: "near-duplicate"
        })
      ]
    })

    const projectItems = items.filter((item) => item.kind === "project-gpx")
    expect(projectItems).toHaveLength(1)
    expect(projectItems[0]?.sourceId).toBe("canonical")
  })

  it("drops geometry-identical atlas re-imports before duplicate-family folding", () => {
    const items = normalizeRideLibrary({
      projectRoutes: [
        projectRoute({ id: "original" }),
        projectRoute({ id: "same-shape", duplicateOf: "original" })
      ]
    })

    expect(items.filter((item) => item.kind === "project-gpx").map((item) => item.sourceId)).toEqual(["original"])
  })
})
