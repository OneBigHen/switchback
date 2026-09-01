import { describe, expect, it } from "vitest"
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

describe("normalizeRideLibrary", () => {
  it("preserves imported provenance for saved GPX routes", () => {
    const [item] = normalizeRideLibrary({ savedRoutes: [savedRoute()] })

    expect(item?.kind).toBe("saved-route")
    expect(item?.management?.imported).toBe(true)
  })

  it("does not label normally planned saved routes as imported", () => {
    const [item] = normalizeRideLibrary({
      savedRoutes: [savedRoute({ routingSource: "graphhopper" })]
    })

    expect(item?.management?.imported).toBe(false)
  })
})
