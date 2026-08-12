import { webcrypto } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import {
  createSyncRoot,
  decryptJsonSyncObject,
  encryptJsonSyncObject,
  mergeSyncHeaders,
  parseSyncEnvelope
} from "@/lib/sync/encrypted-sync"

describe("encrypted sync", () => {
  it("encrypts metadata as authenticated AAD and rejects tampering", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const root = createSyncRoot()
    const metadata = { namespaceId: "ns-1", collection: "settings", objectId: "map", revision: "2", updatedAt: "2026-08-12T10:00:00.000Z" }
    const envelope = await encryptJsonSyncObject(root, metadata, { theme: "night" })
    await expect(decryptJsonSyncObject(root, envelope)).resolves.toEqual({ theme: "night" })
    const tampered = { ...envelope, revision: "3" as const }
    await expect(decryptJsonSyncObject(root, tampered)).rejects.toThrow(/authentication|invalid/i)
    expect(parseSyncEnvelope(envelope).version).toBe(1)
  })

  it("keeps route conflicts as copies and settings last-write-wins", () => {
    const local = { objectId: "route-1", revision: "a", updatedAt: "2026-08-12T10:00:00Z", tombstone: false }
    const remote = { objectId: "route-1", revision: "b", updatedAt: "2026-08-12T11:00:00Z", tombstone: false }
    expect(mergeSyncHeaders(local, remote, "routes")).toHaveLength(2)
    expect(mergeSyncHeaders(local, remote, "settings")).toEqual([remote])
  })
})
