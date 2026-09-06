import "fake-indexeddb/auto"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import Dexie from "dexie"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRideHistory, type RideIntent } from "@/lib/domain/ride-intent"
import { RideCheckpointStore, type RideCheckpointInput } from "@/lib/storage/ride-checkpoint"
import { useRideCheckpoint } from "@/components/planner/useRideCheckpoint"
import { initialPlannerState, usePlannerStore } from "@/stores/planner-store"

const DATABASE = "switchback-ride-intent"
const start = { lat: 40.2732, lon: -76.8867, label: "Restored start" }

function intent(overrides: Partial<RideIntent> = {}): RideIntent {
  return { ...createRideHistory("active-ride").intent, ...overrides }
}

async function seedCheckpoint(input: RideCheckpointInput): Promise<void> {
  const store = new RideCheckpointStore()
  try {
    const saved = await store.save(input, null)
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

beforeEach(async () => {
  cleanup()
  await Dexie.delete(DATABASE)
  localStorage.clear()
  usePlannerStore.setState(initialPlannerState)
})

afterEach(async () => {
  cleanup()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Dexie.delete(DATABASE)
})

describe("Wave 1 checkpoint release regressions", () => {
  it("settles a restored draft so a later rider edit is not mistaken for recovery", async () => {
    await seedCheckpoint({
      rideId: "active-ride",
      identity: "active-ride:4:restored",
      sequence: 4,
      intent: intent({ start, finish: null })
    })

    renderHook(() => useRideCheckpoint())

    await waitFor(() => expect(usePlannerStore.getState().recoveryStatus).toBe("ready"))
    expect(usePlannerStore.getState().start).toEqual(start)
    expect(usePlannerStore.getState().finish).toBeNull()

    act(() => {
      usePlannerStore.getState().setPoint("finish", {
        lat: 39.9526,
        lon: -75.1652,
        label: "Philadelphia"
      })
    })

    expect(usePlannerStore.getState().recoveryStatus).toBe("ready")
  })

  it("flushes the final coalesced ride edit when the checkpoint hook unmounts", async () => {
    const hook = renderHook(() => useRideCheckpoint())
    await waitFor(() => expect(usePlannerStore.getState().recoveryStatus).toBe("ready"))
    await waitFor(async () => expect((await loadCheckpoint()).status).toBe("restored"))

    act(() => {
      usePlannerStore.getState().editRide({ targetMinutes: 240 }, "Longer ride")
    })
    hook.unmount()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const restored = await loadCheckpoint()
    expect(restored.status).toBe("restored")
    if (restored.status === "restored") {
      expect(restored.checkpoint.intent.targetMinutes).toBe(240)
      expect(restored.checkpoint.identity).toBe(usePlannerStore.getState().rideHistory.identity)
    }
  })
})
