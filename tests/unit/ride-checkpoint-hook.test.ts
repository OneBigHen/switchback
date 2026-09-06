import "fake-indexeddb/auto"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import Dexie from "dexie"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRideHistory, type RideIntent } from "@/lib/domain/ride-intent"
import type { AvoidArea } from "@/lib/routing/types"
import { RideCheckpointStore, type RideCheckpointInput } from "@/lib/storage/ride-checkpoint"
import { useRideCheckpoint } from "@/components/planner/useRideCheckpoint"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

const CHECKPOINT_DATABASE = "switchback-ride-intent"
const LEGACY_PLANNER_KEY = "switchback.planner.v1"
const PLANNER_UI_KEY = "switchback.planner.ui.v1"

const area: AvoidArea = {
  id: "ridge-closure",
  polygon: [[-77, 40], [-76.9, 40], [-76.9, 40.1], [-77, 40]]
}

const legacyPlace = {
  id: "legacy-place",
  label: "Old overlook",
  lat: 40.2,
  lon: -76.9,
  createdAt: 1
}

const legacySearch = {
  id: "legacy-search",
  query: "old overlook",
  searchedAt: 2
}

function intent(overrides: Partial<RideIntent> = {}): RideIntent {
  return {
    ...createRideHistory("active-ride").intent,
    ...overrides
  }
}

function checkpointInput(overrides: Partial<RideCheckpointInput> = {}): RideCheckpointInput {
  return {
    rideId: "active-ride",
    identity: "active-ride:4:seeded",
    sequence: 4,
    intent: intent({
      avoidHighways: true,
      avoidAreas: [area]
    }),
    ...overrides
  }
}

async function seedCheckpoint(overrides: Partial<RideCheckpointInput> = {}): Promise<void> {
  const store = new RideCheckpointStore()
  try {
    const saved = await store.save(checkpointInput(overrides), null)
    expect(saved.status).toBe("saved")
  } finally {
    store.close()
  }
}

async function loadCheckpoint() {
  const store = new RideCheckpointStore()
  try {
    return await store.load()
  } finally {
    store.close()
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => { resolve = promiseResolve })
  return { promise, resolve }
}

beforeEach(async () => {
  cleanup()
  await Dexie.delete(CHECKPOINT_DATABASE)
  localStorage.clear()
  usePlannerStore.setState(initialPlannerState)
})

afterEach(async () => {
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 0))
  vi.restoreAllMocks()
  await Dexie.delete(CHECKPOINT_DATABASE)
})

describe("useRideCheckpoint", () => {
  it("restores the checkpoint without competing legacy hydration", async () => {
    await seedCheckpoint({
      intent: intent({ profile: "adventure", avoidHighways: true, avoidAreas: [area] })
    })
    const legacy = JSON.stringify({
      state: {
        profile: "gravel",
        savedPlaces: [legacyPlace],
        searchHistory: [legacySearch]
      },
      version: 1
    })
    localStorage.setItem(LEGACY_PLANNER_KEY, legacy)

    renderHook(() => useRideCheckpoint())

    await waitFor(() => expect(usePlannerStore.getState().recoveryStatus).toBe("restored"))
    expect(usePlannerStore.getState()).toMatchObject({
      profile: "adventure",
      avoidHighways: true,
      avoidAreas: [area],
      savedPlaces: [],
      searchHistory: []
    })
    expect(localStorage.getItem(LEGACY_PLANNER_KEY)).toBe(legacy)
  })

  it("adopts legacy ride preferences without making them the rider's first Undo", async () => {
    const legacy = JSON.stringify({
      state: {
        profile: "adventure",
        savedPlaces: [legacyPlace],
        searchHistory: [legacySearch]
      },
      version: 1
    })
    localStorage.setItem(LEGACY_PLANNER_KEY, legacy)

    renderHook(() => useRideCheckpoint())

    await waitFor(() => expect(usePlannerStore.getState().recoveryStatus).toBe("ready"))
    const adopted = usePlannerStore.getState()
    expect(adopted.profile).toBe("adventure")
    // Inherited preferences are initialization, not a ride change.
    expect(adopted.canUndoRideChange).toBe(false)
    expect(adopted.rideHistory.lastChange?.undoable).toBe(false)
    expect(localStorage.getItem(LEGACY_PLANNER_KEY)).toBe(legacy)
  })

  it("carries saved places and searches across the persist key rename", async () => {
    localStorage.setItem(LEGACY_PLANNER_KEY, JSON.stringify({
      state: {
        profile: "adventure",
        savedPlaces: [legacyPlace],
        searchHistory: [legacySearch],
        curvatureVisible: false
      },
      version: 1
    }))
    localStorage.removeItem(PLANNER_UI_KEY)

    // The UI index migrates through the store's own storage bridge, so it
    // survives even when IndexedDB — and therefore ride recovery — is
    // unavailable on this device.
    await usePlannerStore.persist.rehydrate()

    expect(usePlannerStore.getState()).toMatchObject({
      savedPlaces: [legacyPlace],
      searchHistory: [legacySearch],
      curvatureVisible: false
    })
    expect(localStorage.getItem(LEGACY_PLANNER_KEY)).not.toBeNull()
  })

  it("round-trips highway and excluded-area intent through a fresh hook mount", async () => {
    const first = renderHook(() => useRideCheckpoint())
    await waitFor(() => expect(usePlannerStore.getState().recoveryStatus).toBe("ready"))

    act(() => {
      usePlannerStore.getState().editRide({
        avoidHighways: true,
        avoidAreas: [area]
      }, "Set highway and area preferences", "settings")
    })
    await waitFor(async () => {
      const saved = await loadCheckpoint()
      expect(saved.status).toBe("restored")
      if (saved.status === "restored") {
        expect(saved.checkpoint.intent.avoidHighways).toBe(true)
        expect(saved.checkpoint.intent.avoidAreas).toEqual([area])
      }
    })

    first.unmount()
    await new Promise((resolve) => setTimeout(resolve, 0))
    act(() => usePlannerStore.setState(initialPlannerState))
    renderHook(() => useRideCheckpoint())

    await waitFor(() => expect(usePlannerStore.getState().recoveryStatus).toBe("restored"))
    expect(usePlannerStore.getState()).toMatchObject({
      avoidHighways: true,
      avoidAreas: [area]
    })
  })

  it("does not overwrite a user edit when checkpoint recovery arrives late", async () => {
    await seedCheckpoint()
    const originalLoad = RideCheckpointStore.prototype.load
    const loadStarted = deferred<void>()
    const releaseLoad = deferred<void>()
    vi.spyOn(RideCheckpointStore.prototype, "load").mockImplementation(function (this: RideCheckpointStore) {
      loadStarted.resolve()
      return releaseLoad.promise.then(() => originalLoad.call(this))
    })

    renderHook(() => useRideCheckpoint())
    await loadStarted.promise

    const userFinish = { lat: 40.5, lon: -76.5, label: "User destination" }
    act(() => usePlannerStore.getState().setPoint("finish", userFinish))
    const userIdentity = usePlannerStore.getState().getIntentIdentity()
    releaseLoad.resolve()

    // The rider's ride wins, and this is not a cross-tab conflict: the tab
    // must keep checkpointing what they can actually see, or the ride in front
    // of them silently stops being recoverable.
    await waitFor(() => expect(usePlannerStore.getState().recoveryStatus).toBe("superseded"))
    expect(usePlannerStore.getState().finish).toEqual(userFinish)
    expect(usePlannerStore.getState().getIntentIdentity()).toBe(userIdentity)
    await waitFor(async () => {
      const persisted = await loadCheckpoint()
      expect(persisted.status).toBe("restored")
      if (persisted.status === "restored") {
        expect(persisted.checkpoint.identity).toBe(userIdentity)
        expect(persisted.checkpoint.intent.finish).toEqual(userFinish)
      }
    })
  })

  it("stops writing and warns the rider when another tab owns the saved ride", async () => {
    await seedCheckpoint()
    renderHook(() => useRideCheckpoint())
    await waitFor(() => expect(usePlannerStore.getState().recoveryStatus).toBe("restored"))

    // A second tab commits against the same record, rotating the write token.
    const other = new RideCheckpointStore()
    try {
      const loaded = await other.load()
      expect(loaded.status).toBe("restored")
      if (loaded.status !== "restored") throw new Error("Checkpoint was lost")
      const otherSave = await other.save(
        { ...loaded.checkpoint, identity: "active-ride:9:other", sequence: 9 },
        loaded.checkpoint.token
      )
      expect(otherSave.status).toBe("saved")
    } finally {
      other.close()
    }

    act(() => usePlannerStore.getState().editRide({ targetMinutes: 240 }, "Longer ride"))

    await waitFor(() => expect(usePlannerStore.getState().recoveryStatus).toBe("conflict"))
    const persisted = await loadCheckpoint()
    expect(persisted.status).toBe("restored")
    if (persisted.status === "restored") expect(persisted.checkpoint.identity).toBe("active-ride:9:other")
  })
})
