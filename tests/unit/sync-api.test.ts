import { afterEach, describe, expect, it, vi } from "vitest"

import { handleSyncGet } from "@/app/api/sync/route"
import { handleSyncLink } from "@/app/api/sync/link/route"
import { createIdentitySession } from "@/lib/identity/passkey"
import type { SyncRepository } from "@/lib/sync/repository"

const secret = "s".repeat(32)
const identityId = "rider-12345678901234567890"

afterEach(() => {
  delete process.env.SWITCHBACK_SESSION_SECRET
})

function credentials(): string {
  const session = createIdentitySession(identityId, secret)
  return `switchback_session=${session}; switchback_csrf=csrf-token`
}

describe("sync API contract", () => {
  it("returns the bounded cursor page without exposing the sync root", async () => {
    process.env.SWITCHBACK_SESSION_SECRET = secret
    const store = {
      list: vi.fn(() => ({ envelopes: [{ version: 1, namespaceId: "ns-api-test-1", collection: "settings", objectId: "rider-settings", revision: "rev-1", updatedAt: "2026-08-12T10:00:00.000Z", nonce: "AAAAAAAAAAAAAAAA", ciphertext: "AAAAAAAAAAAAAAAAAAAAAAAA" }], nextCursor: "cursor-1" }))
    } as unknown as SyncRepository

    const response = await handleSyncGet(new Request("http://switchback.test/api/sync?namespaceId=ns-api-test-1&limit=10", {
      headers: { cookie: credentials() }
    }), store)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ nextCursor: "cursor-1", envelopes: [{ updatedAt: "2026-08-12T10:00:00.000Z" }] })
    expect(store.list).toHaveBeenCalledWith(identityId, "ns-api-test-1", { collection: undefined, objectId: undefined, limit: 10, cursor: null })
  })

  it("keeps linking behind the authenticated mutation boundary", async () => {
    process.env.SWITCHBACK_SESSION_SECRET = secret
    const store = { link: vi.fn() } as unknown as SyncRepository
    const response = await handleSyncLink(new Request("http://switchback.test/api/sync/link", {
      method: "POST",
      headers: { cookie: credentials(), "x-switchback-csrf": "csrf-token", "content-type": "application/json" },
      body: JSON.stringify({ namespaceId: "ns-api-test-1" })
    }), store)

    expect(response.status).toBe(200)
    expect(store.link).toHaveBeenCalledWith(identityId, "ns-api-test-1")
  })

  it("does not treat malformed page requests as authentication failures", async () => {
    process.env.SWITCHBACK_SESSION_SECRET = secret
    const store = {
      list: vi.fn(() => { throw new Error("Sync cursor is invalid") })
    } as unknown as SyncRepository
    const response = await handleSyncGet(new Request("http://switchback.test/api/sync?namespaceId=ns-api-test-1&cursor=bad", {
      headers: { cookie: credentials() }
    }), store)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_SYNC_REQUEST" } })
  })
})
