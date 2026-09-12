import "fake-indexeddb/auto"

import { webcrypto } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createIdentitySession, readIdentitySession } from "@/lib/identity/passkey"
import { RouteLibrary } from "@/lib/storage/route-library"
import { SyncClientStore } from "@/lib/sync/client-store"
import { createRecoveryKit, parseRecoveryKit } from "@/lib/sync/recovery-kit"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("OpenGravel cutover compatibility", () => {
  it("preserves the existing route and sync IndexedDB names", () => {
    expect(new RouteLibrary().name).toBe("switchback")
    expect(new SyncClientStore().name).toBe("switchback-sync")
  })

  it("preserves the existing authenticated-session cookie contract", () => {
    const secret = "s".repeat(32)
    const identityId = "rider-12345678901234567890"
    const token = createIdentitySession(identityId, secret, 60_000, 1_000)
    const request = new Request("https://rides.example.test", {
      headers: { cookie: `switchback_session=${token}` }
    })

    expect(readIdentitySession(request, secret, 2_000)).toBe(identityId)
  })

  it("preserves Switchback recovery-kit wire compatibility after the public rebrand", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const state = {
      id: "state" as const,
      namespaceId: "ns-12345678-1234-1234-1234-123456789012",
      root: new Uint8Array(32).fill(7),
      linked: false,
      createdAt: "2026-09-12T00:00:00.000Z"
    }

    const kit = await createRecoveryKit(state)
    expect(kit.format).toBe("switchback-sync-recovery")
    expect(kit.version).toBe(1)
    expect(kit.seed.startsWith("SB1.")).toBe(true)

    const fromRawSeed = await parseRecoveryKit(kit.seed)
    const fromLegacyUri = await parseRecoveryKit(`switchback-sync:${kit.seed}`)
    expect(fromRawSeed.namespaceId).toBe(state.namespaceId)
    expect(fromLegacyUri.namespaceId).toBe(state.namespaceId)
    expect([...fromLegacyUri.root]).toEqual([...state.root])
  })
})
