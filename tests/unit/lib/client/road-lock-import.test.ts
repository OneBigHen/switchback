import { describe, expect, it, vi } from "vitest"
import { importGpxRoadLock } from "@/lib/client/road-lock-import"
import type { PlannedRoute } from "@/lib/routing/types"
import { usePlannerStore } from "@/stores/planner-store"

const route: PlannedRoute = {
  id: "imported-route",
  name: "Ridge section",
  profile: "scenic",
  geometry: [[-77, 40], [-76.9, 40.1], [-76.8, 40.15]],
  waypoints: [],
  instructions: [],
  distanceMiles: 12,
  durationMinutes: 25,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 30,
  turnCount: 8,
  roadMix: {},
  surfaceMix: {},
  routingSource: "imported",
  previewOnly: false
}

describe("GPX road-lock import service", () => {
  it("returns a ready-to-store lock without mutating planner state", async () => {
    usePlannerStore.setState({ roadLocks: [] })
    const parseFile = vi.fn().mockResolvedValue(route)
    const file = new File(["<gpx />"], "ridge.gpx", { type: "application/gpx+xml" })

    const lock = await importGpxRoadLock(file, {
      mode: "prefer",
      displayName: " Ridge crest ",
      sourceRegionId: "region-1",
      sourceGraphVersion: "graph-2"
    }, { parseFile })

    expect(parseFile).toHaveBeenCalledWith(file)
    expect(lock).toMatchObject({
      mode: "prefer",
      displayName: "Ridge crest",
      source: "gpx",
      confidence: "approximate",
      sourceRegionId: "region-1",
      sourceGraphVersion: "graph-2",
      geometry: { type: "LineString", coordinates: route.geometry },
      orderedAnchors: [route.geometry[0], route.geometry.at(-1)]
    })
    expect(lock.accessSnapshot).toMatchObject({
      motorcycleAccess: "unknown",
      generalAccess: "unknown",
      routable: true
    })
    expect(usePlannerStore.getState().roadLocks).toEqual([])
  })

  it("rejects invalid imported geometry before creating a lock", async () => {
    const parseFile = vi.fn().mockResolvedValue({ ...route, geometry: [[-77, 40]] })
    const file = new File(["<gpx />"], "invalid.gpx", { type: "application/gpx+xml" })

    await expect(importGpxRoadLock(file, { mode: "must" }, { parseFile }))
      .rejects.toThrow(/usable track geometry/i)
  })

  it("rejects oversized files before invoking the worker parser", async () => {
    const parseFile = vi.fn()
    const file = new File(["too large"], "huge.gpx", { type: "application/gpx+xml" })

    await expect(importGpxRoadLock(file, { mode: "must" }, { parseFile, maxImportBytes: 1 }))
      .rejects.toThrow(/5 MB/i)
    expect(parseFile).not.toHaveBeenCalled()
  })
})
