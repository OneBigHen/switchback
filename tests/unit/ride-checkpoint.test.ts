import "fake-indexeddb/auto"
import Dexie from "dexie"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createRideHistory, type RideIntent } from "@/lib/domain/ride-intent"
import type { PlannedRoute } from "@/lib/routing/types"
import { RouteLibrary } from "@/lib/storage/route-library"
import {
  RideCheckpointStore,
  type RideCheckpointInput
} from "@/lib/storage/ride-checkpoint"

const route: PlannedRoute = {
  id: "checkpoint-route",
  name: "Checkpoint ridge",
  profile: "twisty",
  geometry: [[-77, 40], [-76.9, 40.1]],
  waypoints: [],
  instructions: [],
  distanceMiles: 22,
  durationMinutes: 38,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 71,
  turnCount: 31,
  roadMix: { secondary: 80 },
  surfaceMix: { asphalt: 100 },
  routingSource: "live",
  previewOnly: false
}

const intent = (): RideIntent => ({
  ...createRideHistory("ride").intent,
  avoidHighways: true,
  avoidAreas: [{
    id: "area",
    polygon: [[-77, 40], [-76, 40], [-76, 41], [-77, 40]]
  }]
})

function input(overrides: Partial<RideCheckpointInput> = {}): RideCheckpointInput {
  return {
    identity: "ride:1",
    sequence: 1,
    rideId: "ride",
    intent: intent(),
    ...overrides
  }
}

async function seedCheckpoint(name: string, value: unknown): Promise<void> {
  const database = new Dexie(name)
  database.version(1).stores({ checkpoints: "&id" })
  await database.open()
  await database.table("checkpoints").put(value)
  database.close()
}

async function deleteDatabase(name: string): Promise<void> {
  await Dexie.delete(name)
}

const validRawCheckpoint = () => ({
  id: "active",
  version: 1,
  token: "raw-token",
  ...input()
})

const stores = new Set<RideCheckpointStore>()

afterEach(() => {
  for (const store of stores) store.close()
  stores.clear()
  vi.restoreAllMocks()
})

describe("atomic ride checkpoint", () => {
  it("restores excluded areas and highway preference, refusing a newer tab overwrite", async () => {
    const name = `checkpoint-${crypto.randomUUID()}`
    const first = new RideCheckpointStore(name)
    const second = new RideCheckpointStore(name)
    stores.add(first).add(second)

    const saved = await first.save(input({ identity: "ride:1", sequence: 1 }), null)
    expect(saved.status).toBe("saved")

    const restored = await second.load()
    expect(restored.status).toBe("restored")
    if (restored.status !== "restored" || saved.status !== "saved") throw new Error("Missing checkpoint")
    expect(restored.checkpoint.intent).toEqual(intent())

    expect((await second.save(
      input({ identity: "ride:2", sequence: 2 }),
      restored.checkpoint.token
    )).status).toBe("saved")
    expect((await first.save(
      input({ identity: "ride:3", sequence: 3 }),
      restored.checkpoint.token
    )).status).toBe("conflict")
  })

  it.each([
    {
      label: "corrupt",
      value: { ...validRawCheckpoint(), intent: { mode: "not-a-ride-intent" } },
      status: "invalid"
    },
    {
      label: "partial",
      value: { id: "active", version: 1, token: "partial-token" },
      status: "invalid"
    },
    {
      label: "incompatible",
      value: { ...validRawCheckpoint(), version: 99 },
      status: "incompatible"
    }
  ])("safely refuses a $label persisted checkpoint", async ({ value, status }) => {
    const name = `checkpoint-${crypto.randomUUID()}`
    await seedCheckpoint(name, value)
    const store = new RideCheckpointStore(name)
    stores.add(store)

    await expect(store.load()).resolves.toEqual({ status })
  })

  it("lets the token holder replace an older draft with a fresh lower-sequence ride", async () => {
    const name = `checkpoint-${crypto.randomUUID()}`
    const store = new RideCheckpointStore(name)
    stores.add(store)

    const current = await store.save(input({ identity: "ride:3", sequence: 3 }), null)
    expect(current.status).toBe("saved")
    if (current.status !== "saved") throw new Error("Initial checkpoint was not saved")

    // Whoever holds the current token owns the next write. A tab that started
    // a new ride instead of restoring this draft is not in conflict with it —
    // refusing here would leave that tab unable to save anything at all.
    expect((await store.save(
      input({ identity: "ride:2", sequence: 2 }),
      current.token
    )).status).toBe("saved")
    const restored = await store.load()
    expect(restored.status).toBe("restored")
    if (restored.status !== "restored") throw new Error("Latest checkpoint was lost")
    expect(restored.checkpoint.sequence).toBe(2)
    expect(restored.checkpoint.identity).toBe("ride:2")
  })

  it("refuses a write that would give one identity two different intents", async () => {
    const name = `checkpoint-${crypto.randomUUID()}`
    const store = new RideCheckpointStore(name)
    stores.add(store)

    const current = await store.save(input(), null)
    expect(current.status).toBe("saved")
    if (current.status !== "saved") throw new Error("Initial checkpoint was not saved")

    expect((await store.save(
      input({ intent: { ...intent(), avoidHighways: false } }),
      current.token
    )).status).toBe("conflict")
    const restored = await store.load()
    expect(restored.status).toBe("restored")
    if (restored.status !== "restored") throw new Error("Latest checkpoint was lost")
    expect(restored.checkpoint.intent.avoidHighways).toBe(true)
  })

  it("treats the same intent with a different key order as the same intent, not a conflict", async () => {
    const name = `checkpoint-${crypto.randomUUID()}`
    const store = new RideCheckpointStore(name)
    stores.add(store)

    const first = await store.save(input(), null)
    if (first.status !== "saved") throw new Error("Initial checkpoint was not saved")
    const reordered = Object.fromEntries(Object.entries(intent()).reverse()) as RideIntent
    expect((await store.save(input({ intent: reordered, sequence: 2 }), first.token)).status).toBe("saved")
  })

  it("stores authored intent only, never a derived route result", async () => {
    const name = `checkpoint-${crypto.randomUUID()}`
    const store = new RideCheckpointStore(name)
    stores.add(store)

    expect((await store.save(input(), null)).status).toBe("saved")
    const restored = await store.load()
    expect(restored.status).toBe("restored")
    if (restored.status !== "restored") throw new Error("Checkpoint was lost")
    expect(restored.checkpoint).not.toHaveProperty("result")
    expect(JSON.stringify(restored.checkpoint)).not.toContain(route.id)
  })

  it("keeps preexisting library records unchanged in the dedicated checkpoint database", async () => {
    const libraryName = `switchback-library-${crypto.randomUUID()}`
    const checkpointName = `switchback-checkpoint-${crypto.randomUUID()}`
    const library = new RouteLibrary(libraryName)
    const store = new RideCheckpointStore(checkpointName)
    stores.add(store)

    try {
      const savedRoute = await library.save(route, "keep this library record")
      const before = await library.list()
      const saved = await store.save(input(), null)
      expect(saved.status).toBe("saved")
      expect(await store.load()).toMatchObject({ status: "restored" })
      expect(await library.list()).toEqual(before)
      expect(await library.get(savedRoute.id)).toEqual(savedRoute)
    } finally {
      store.close()
      stores.delete(store)
      await library.destroy()
      await deleteDatabase(checkpointName)
    }
  })

  it("reports unavailable when IndexedDB storage is denied", async () => {
    const name = `checkpoint-${crypto.randomUUID()}`
    const open = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("Storage access was denied.", "NotAllowedError")
    })
    const store = new RideCheckpointStore(name)
    stores.add(store)

    await expect(store.load()).resolves.toEqual({ status: "unavailable" })
    await expect(store.save(input(), null)).resolves.toEqual({ status: "unavailable" })
    open.mockRestore()
  })

  it("reports unavailable when a checkpoint write exceeds storage quota", async () => {
    const name = `checkpoint-${crypto.randomUUID()}`
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("Storage quota exceeded.", "QuotaExceededError")
    })
    const store = new RideCheckpointStore(name)
    stores.add(store)

    await expect(store.save(input(), null)).resolves.toEqual({ status: "unavailable" })
    put.mockRestore()
  })

  it("allows only one of two tabs to commit against the same observed token", async () => {
    const name = `checkpoint-${crypto.randomUUID()}`
    const first = new RideCheckpointStore(name)
    const second = new RideCheckpointStore(name)
    stores.add(first).add(second)

    const initial = await first.save(input(), null)
    expect(initial.status).toBe("saved")
    if (initial.status !== "saved") throw new Error("Initial checkpoint was not saved")
    const observedToken = initial.token

    const results = await Promise.all([
      first.save(input({ identity: "ride:first", sequence: 2 }), observedToken),
      second.save(input({ identity: "ride:second", sequence: 2 }), observedToken)
    ])
    expect(results.map((result) => result.status).sort()).toEqual(["conflict", "saved"])

    const winner = await first.load()
    expect(winner.status).toBe("restored")
    if (winner.status !== "restored") throw new Error("CAS winner was not persisted")
    expect(["ride:first", "ride:second"]).toContain(winner.checkpoint.identity)
  })
})
