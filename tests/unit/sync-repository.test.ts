import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { webcrypto } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import { encryptJsonSyncObject } from "@/lib/sync/encrypted-sync"
import { SyncRepository } from "@/lib/sync/repository"

const resources: Array<{ repository: SyncRepository; directory: string }> = []

afterEach(() => {
  for (const resource of resources.splice(0)) {
    resource.repository.close()
    rmSync(resource.directory, { recursive: true, force: true })
  }
})

async function envelope(root: Uint8Array, objectId: string, revision: string, updatedAt: string) {
  return encryptJsonSyncObject(root, {
    namespaceId: "ns-sync-test-1",
    collection: "settings",
    objectId,
    revision,
    updatedAt
  }, { objectId, revision })
}

describe("SyncRepository", () => {
  it("returns deterministic bounded pages with authenticated timestamps and an opaque cursor", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-sync-repository-"))
    const repository = new SyncRepository(path.join(directory, "sync.sqlite"))
    resources.push({ repository, directory })
    const root = new Uint8Array(32).fill(7)

    const first = await envelope(root, "alpha", "rev-a", "2026-08-12T10:00:00.000Z")
    const second = await envelope(root, "beta", "rev-b", "2026-08-12T10:00:00.000Z")
    repository.put("identity-1", first)
    repository.put("identity-1", first)
    repository.put("identity-1", second)

    const page = repository.list("identity-1", "ns-sync-test-1", { limit: 1 })
    expect(page.envelopes).toHaveLength(1)
    expect(page.envelopes[0]).toMatchObject({ objectId: "alpha", updatedAt: "2026-08-12T10:00:00.000Z" })
    expect(page.nextCursor).toEqual(expect.any(String))

    const next = repository.list("identity-1", "ns-sync-test-1", { limit: 1, cursor: page.nextCursor! })
    expect(next.envelopes).toHaveLength(1)
    expect(next.envelopes[0]).toMatchObject({ objectId: "beta", updatedAt: "2026-08-12T10:00:00.000Z" })
    expect(next.nextCursor).toBeNull()
  })

  it("allows an authenticated identity to link a namespace but never another identity", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "switchback-sync-link-"))
    const repository = new SyncRepository(path.join(directory, "sync.sqlite"))
    resources.push({ repository, directory })

    repository.link("identity-1", "ns-link-test-1")
    expect(() => repository.link("identity-1", "ns-link-test-1")).not.toThrow()
    expect(() => repository.link("identity-2", "ns-link-test-1")).toThrow(/not owned/i)
  })
})
