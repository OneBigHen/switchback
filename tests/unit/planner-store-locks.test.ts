import "fake-indexeddb/auto"
import { beforeEach, describe, expect, it } from "vitest"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import { createManualRoadLock } from "@/lib/roads/road-locks"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"

const accessibleSnapshot: RoadAccessSnapshot = {
  highwayClass: "secondary",
  motorcycleAccess: "yes",
  generalAccess: "yes",
  surface: "asphalt",
  smoothness: "good",
  tracktype: "unknown",
  maxweightTonnes: null,
  seasonalUndated: false,
  activeConditions: [],
  routable: true
}

const line: Coordinate[] = [
  [-76.5, 40.2],
  [-76.4, 40.22]
]

const anchors: Coordinate[] = [
  [-76.5, 40.2],
  [-76.4, 40.22]
]

function makeLock(mode: "must" | "prefer" = "must", displayName?: string) {
  return createManualRoadLock({
    mode,
    displayName,
    edgeIds: ["e1", "e2"],
    geometry: line,
    orderedAnchors: anchors,
    accessSnapshot: accessibleSnapshot,
    sourceRegionId: "pennsylvania",
    sourceGraphVersion: "gh-11-1"
  })
}

describe("planner-store road locks", () => {
  beforeEach(() => {
    usePlannerStore.setState(initialPlannerState)
    localStorage.clear()
  })

  it("adds a road lock and invalidates the active plan", () => {
    const store = usePlannerStore.getState()
    store.applyPlan({
      selectedRouteId: "r1",
      routes: [],
      warnings: []
    })
    const lock = makeLock("must", "Ridge Road")
    store.addRoadLock(lock)

    const next = usePlannerStore.getState()
    expect(next.roadLocks).toEqual([lock])
    expect(next.plan).toBeNull()
    expect(next.selectedRouteId).toBeNull()
    expect(next.status).toBe("idle")
  })

  it("ignores an add with an existing id so duplicates cannot pile up", () => {
    const store = usePlannerStore.getState()
    const lock = makeLock("must")
    store.addRoadLock(lock)
    store.addRoadLock(lock)

    expect(usePlannerStore.getState().roadLocks).toHaveLength(1)
  })

  it("updates a lock's mode and tolerance without dropping identity", () => {
    const store = usePlannerStore.getState()
    const lock = makeLock("must", "Brook")
    store.addRoadLock(lock)

    store.updateRoadLock(lock.id, {
      fallbackToleranceMeters: 120,
      displayName: "Brook Run"
    })

    const next = usePlannerStore.getState()
    expect(next.roadLocks).toHaveLength(1)
    expect(next.roadLocks[0]).toMatchObject({
      id: lock.id,
      fallbackToleranceMeters: 120,
      displayName: "Brook Run",
      mode: "must"
    })
    expect(next.plan).toBeNull()
  })

  it("converts a must lock to prefer while preserving provenance and edge ids", () => {
    const store = usePlannerStore.getState()
    const lock = makeLock("must", "Skyline")
    store.addRoadLock(lock)
    store.convertRoadLock(lock.id)

    const next = usePlannerStore.getState()
    expect(next.roadLocks[0]).toMatchObject({
      id: lock.id,
      mode: "prefer",
      source: "manual",
      confidence: "exact"
    })
  })

  it("leaves prefer locks untouched when convertRoadLock is invoked", () => {
    const store = usePlannerStore.getState()
    const lock = makeLock("prefer", "Skyline")
    store.addRoadLock(lock)
    store.convertRoadLock(lock.id)

    expect(usePlannerStore.getState().roadLocks[0]!.mode).toBe("prefer")
  })

  it("removes a single lock and invalidates the active plan", () => {
    const store = usePlannerStore.getState()
    const first = makeLock("must", "A")
    const second = makeLock("prefer", "B")
    store.addRoadLock(first)
    store.addRoadLock(second)
    store.applyPlan({
      selectedRouteId: "r2",
      routes: [],
      warnings: []
    })
    store.removeRoadLock(first.id)

    const next = usePlannerStore.getState()
    expect(next.roadLocks.map((l) => l.id)).toEqual([second.id])
    expect(next.plan).toBeNull()
    expect(next.selectedRouteId).toBeNull()
  })

  it("clears every road lock in one pass", () => {
    const store = usePlannerStore.getState()
    store.addRoadLock(makeLock("must", "one"))
    store.addRoadLock(makeLock("prefer", "two"))
    store.clearRoadLocks()

    expect(usePlannerStore.getState().roadLocks).toEqual([])
  })

  it("switches bike profiles and invalidates the active plan", () => {
    const store = usePlannerStore.getState()
    store.applyPlan({
      selectedRouteId: "r3",
      routes: [],
      warnings: []
    })
    const adventure = MOTORCYCLE_PROFILES.find((p) => p.category === "adventure")!
    store.setBikeProfile({ ...adventure })

    const next = usePlannerStore.getState()
    expect(next.bikeProfile.category).toBe("adventure")
    expect(next.plan).toBeNull()
    expect(next.status).toBe("idle")
  })

  it("preserves road locks and bike profile across persistence", () => {
    const store = usePlannerStore.getState()
    const lock = makeLock("must", "Persisted")
    store.addRoadLock(lock)
    const dual = MOTORCYCLE_PROFILES.find((p) => p.category === "dual-sport")!
    store.setBikeProfile({ ...dual })

    const persisted = (usePlannerStore as unknown as {
      persist: { getOptions: () => { partialize: (s: unknown) => unknown } }
    }).persist.getOptions().partialize(usePlannerStore.getState())
    expect(persisted).toMatchObject({
      roadLocks: [expect.objectContaining({ id: lock.id })],
      bikeProfile: expect.objectContaining({ category: "dual-sport" })
    })

    const serialized = JSON.stringify(persisted)
    expect(serialized).toContain(lock.id)
    expect(serialized).toContain("dual-sport")
  })

  it("resets to an empty lock set with initialPlannerState", () => {
    const store = usePlannerStore.getState()
    store.addRoadLock(makeLock("must"))
    usePlannerStore.setState(initialPlannerState)

    expect(usePlannerStore.getState().roadLocks).toEqual([])
    expect(usePlannerStore.getState().bikeProfile.category).toBe("street")
  })

  it("ignores remove with an unknown id", () => {
    const store = usePlannerStore.getState()
    const before = usePlannerStore.getState().roadLocks.length

    store.removeRoadLock("does-not-exist")

    expect(usePlannerStore.getState().roadLocks).toHaveLength(before)
  })

  it("ignores clearRoadLocks when no locks exist", () => {
    const store = usePlannerStore.getState()
    store.clearRoadLocks()
    expect(usePlannerStore.getState().roadLocks).toEqual([])
  })

  it("ignores convertRoadLock on an unknown id", () => {
    const store = usePlannerStore.getState()
    store.convertRoadLock("nonexistent-id")
    expect(usePlannerStore.getState().roadLocks).toEqual([])
  })

  it("ignores updateRoadLock on an unknown id", () => {
    const store = usePlannerStore.getState()
    store.updateRoadLock("nonexistent-id", { fallbackToleranceMeters: 999 })
    expect(usePlannerStore.getState().roadLocks).toEqual([])
  })

  it("preserves accessSnapshot when converting must to prefer", () => {
    const store = usePlannerStore.getState()
    const lock = makeLock("must")
    store.addRoadLock(lock)
    store.convertRoadLock(lock.id)

    const next = usePlannerStore.getState().roadLocks[0]!
    expect(next.accessSnapshot).toEqual(lock.accessSnapshot)
    expect(next.edgeIds).toEqual(lock.edgeIds)
    expect(next.sourceRegionId).toBe(lock.sourceRegionId)
  })
})
