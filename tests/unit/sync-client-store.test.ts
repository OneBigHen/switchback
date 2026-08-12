import "fake-indexeddb/auto"

import { afterEach, describe, expect, it } from "vitest"

import { SyncClientStore } from "@/lib/sync/client-store"
import { createRecoveryKit, parseRecoveryKit } from "@/lib/sync/recovery-kit"

const stores: SyncClientStore[] = []

afterEach(async () => {
  for (const store of stores.splice(0)) await store.destroy()
})

describe("sync client recovery", () => {
  it("keeps one local root, exports a QR/seed payload, and imports it unlinked", async () => {
    const first = new SyncClientStore(`switchback-sync-test-${crypto.randomUUID()}`)
    const second = new SyncClientStore(`switchback-sync-test-${crypto.randomUUID()}`)
    stores.push(first, second)

    const original = await first.ensureState()
    expect(Array.from((await first.ensureState()).root)).toEqual(Array.from(original.root))
    const kit = await createRecoveryKit(original)
    expect(kit.qrPayload).toBe(kit.seed)
    const parsed = await parseRecoveryKit(kit.seed)
    expect(parsed.namespaceId).toBe(original.namespaceId)
    expect(Array.from(parsed.root)).toEqual(Array.from(original.root))

    await second.importRecoveryKit(kit.seed)
    const restored = await second.getState()
    expect(restored).toMatchObject({ namespaceId: original.namespaceId, linked: false })
    expect(Array.from(restored?.root ?? [])).toEqual(Array.from(original.root))
  })

  it("rejects a damaged human-entered seed before changing local state", async () => {
    const store = new SyncClientStore(`switchback-sync-test-${crypto.randomUUID()}`)
    stores.push(store)
    const original = await store.ensureState()
    const kit = await createRecoveryKit(original)
    const damaged = `${kit.seed.slice(0, -1)}${kit.seed.endsWith("A") ? "B" : "A"}`
    await expect(store.importRecoveryKit(damaged)).rejects.toThrow(/checksum|invalid/i)
    expect((await store.getState())?.namespaceId).toBe(original.namespaceId)
  })
})
