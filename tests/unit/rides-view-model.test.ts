import { describe, expect, it } from "vitest"
import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import type { SavedRoute } from "@/lib/storage/route-library"
import { normalizeRideLibrary, type NormalizeRidesInput } from "@/components/rides/rides-view-model"

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
    routingSource: "live",
    libraryProvenance: {
      kind: "imported-file",
      sourceFormat: "gpx",
      sourceFileName: "mountain-loop.gpx",
      importedAt: "2026-09-01T12:00:00.000Z"
    },
    ...overrides
  } as SavedRoute
}

function projectRoute(): ProjectGpxRouteSummary {
  return {
    id: "shared-1",
    name: "Armstrong County Loops",
    distanceMiles: 110.2,
    durationMinutes: 0,
    twistiness: 68,
    turnCount: 91,
    sourceProject: "rideplanner"
  }
}

describe("normalizeRideLibrary", () => {
  it("uses explicit personal import provenance even when the route was not routed as imported", () => {
    const [item] = normalizeRideLibrary({ savedRoutes: [savedRoute()] })

    expect(item?.kind).toBe("saved-route")
    expect(item?.management?.imported).toBe(true)
    expect(item?.management?.canMatchRoads).toBe(true)
  })

  it("keeps the legacy imported routing-source fallback during provenance migration", () => {
    const [item] = normalizeRideLibrary({
      savedRoutes: [savedRoute({
        routingSource: "imported",
        libraryProvenance: { kind: "planned" }
      })]
    })

    expect(item?.management?.imported).toBe(true)
  })

  it("does not label normally planned saved routes as imported", () => {
    const [item] = normalizeRideLibrary({
      savedRoutes: [savedRoute({
        routingSource: "live",
        libraryProvenance: { kind: "planned" }
      })]
    })

    expect(item?.management?.imported).toBe(false)
  })

  it("does not admit shared catalog routes into the personal library even from legacy mixed input", () => {
    const legacyMixedInput = {
      savedRoutes: [],
      recordedRides: [],
      trips: [],
      projectRoutes: [projectRoute()]
    } as unknown as NormalizeRidesInput

    expect(normalizeRideLibrary(legacyMixedInput)).toEqual([])
  })
})
