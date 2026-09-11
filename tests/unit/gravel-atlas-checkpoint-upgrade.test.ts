import "fake-indexeddb/auto"
import Dexie from "dexie"
import { afterEach, describe, expect, it } from "vitest"
import { defaultRideIntent } from "@/lib/domain/ride-intent"
import { RideCheckpointStore } from "@/lib/storage/ride-checkpoint"

const stores = new Set<RideCheckpointStore>()
const databaseNames = new Set<string>()

afterEach(async () => {
  for (const store of stores) store.close()
  stores.clear()
  for (const name of databaseNames) await Dexie.delete(name)
  databaseNames.clear()
})

async function seedLegacyCheckpoint(name: string): Promise<void> {
  const intent = { ...defaultRideIntent() } as Record<string, unknown>
  delete intent.gravelAtlas
  const database = new Dexie(name)
  database.version(1).stores({ checkpoints: "&id" })
  await database.open()
  await database.table("checkpoints").put({
    id: "active",
    version: 1,
    token: "legacy-token",
    rideId: "legacy-ride",
    identity: "legacy-ride:3",
    sequence: 3,
    intent
  })
  database.close()
}

describe("Gravel Atlas checkpoint upgrade", () => {
  it("loads a pre-Atlas draft with Atlas off and lets the token holder save the next revision", async () => {
    const name = `gravel-atlas-upgrade-${crypto.randomUUID()}`
    databaseNames.add(name)
    await seedLegacyCheckpoint(name)
    const store = new RideCheckpointStore(name)
    stores.add(store)

    const restored = await store.load()
    expect(restored.status).toBe("restored")
    if (restored.status !== "restored") throw new Error("Legacy checkpoint was not restored")
    expect(restored.checkpoint.intent.gravelAtlas).toEqual({ enabled: false, intensity: "balanced" })

    const nextIntent = {
      ...restored.checkpoint.intent,
      profile: "adventure" as const,
      gravelAtlas: { enabled: true, intensity: "more" as const }
    }
    await expect(store.save({
      rideId: restored.checkpoint.rideId,
      identity: "legacy-ride:4",
      sequence: 4,
      intent: nextIntent
    }, restored.checkpoint.token)).resolves.toMatchObject({ status: "saved" })
  })
})
