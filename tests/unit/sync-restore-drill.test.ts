import "fake-indexeddb/auto"

import { mkdtempSync, rmSync } from "node:fs"
import { webcrypto } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { handleSyncGet, handleSyncPost } from "@/app/api/sync/route"
import { handleSyncLink } from "@/app/api/sync/link/route"
import { createIdentitySession } from "@/lib/identity/passkey"
import { createSyncController } from "@/lib/client/sync-controller"
import { RouteLibrary, type SavedRoute } from "@/lib/storage/route-library"
import { SyncClientStore } from "@/lib/sync/client-store"
import { SyncRepository } from "@/lib/sync/repository"

const secret = "s".repeat(32)
const identityId = "rider-12345678901234567890"
const resources: Array<{ store: SyncClientStore; routes: RouteLibrary }> = []
let repository: SyncRepository | undefined
let directory: string | undefined

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.store.destroy()
    await resource.routes.destroy()
  }
  repository?.close()
  repository = undefined
  if (directory) rmSync(directory, { recursive: true, force: true })
  directory = undefined
  delete process.env.SWITCHBACK_SESSION_SECRET
  localStorage.clear()
})

function route(): SavedRoute {
  return {
    id: "route-restore-1",
    name: "Restore route",
    profile: "twisty",
    geometry: [[-76.9, 40.2], [-76.7, 40.4]],
    waypoints: [],
    instructions: [],
    distanceMiles: 25,
    durationMinutes: 40,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 60,
    turnCount: 20,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false,
    notes: "",
    folder: "Unfiled",
    tags: [],
    visible: true,
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T10:00:00.000Z"
  }
}

describe("two-device recovery drill", () => {
  it("restores saved routes after seed import and authenticated namespace linking", async () => {
    vi.stubGlobal("crypto", webcrypto)
    process.env.SWITCHBACK_SESSION_SECRET = secret
    const session = createIdentitySession(identityId, secret)
    const cookie = `switchback_session=${session}; switchback_csrf=csrf-token`
    Object.defineProperty(document, "cookie", { configurable: true, writable: true, value: cookie })

    directory = mkdtempSync(path.join(tmpdir(), "switchback-sync-restore-"))
    repository = new SyncRepository(path.join(directory, "sync.sqlite"))
    const firstStore = new SyncClientStore(`switchback-restore-first-${crypto.randomUUID()}`)
    const firstRoutes = new RouteLibrary(`switchback-restore-routes-first-${crypto.randomUUID()}`)
    const secondStore = new SyncClientStore(`switchback-restore-second-${crypto.randomUUID()}`)
    const secondRoutes = new RouteLibrary(`switchback-restore-routes-second-${crypto.randomUUID()}`)
    resources.push({ store: firstStore, routes: firstRoutes }, { store: secondStore, routes: secondRoutes })

    const first = createSyncController({ store: firstStore, routeLibrary: firstRoutes, fetcher: apiFetch, sleep: async () => undefined })
    const second = createSyncController({ store: secondStore, routeLibrary: secondRoutes, fetcher: apiFetch, sleep: async () => undefined })
    const firstState = await first.ensureState()
    const kit = await first.exportRecoveryKit()
    await first.linkCurrentSession()
    await firstRoutes.upsertSynced(route())
    await first.sync()

    await secondStore.importRecoveryKit(kit.seed)
    await second.linkCurrentSession()
    await second.sync()

    const restored = await secondRoutes.get("route-restore-1")
    expect(restored?.name).toBe("Restore route")
    expect((await secondStore.getState())?.namespaceId).toBe(firstState.namespaceId)
    expect((await secondStore.getState())?.linked).toBe(true)
  })
})

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set("cookie", document.cookie)
  const request = new Request(new URL(String(input), "http://switchback.test").toString(), { ...init, headers })
  const url = new URL(request.url)
  if (url.pathname === "/api/sync/link") return handleSyncLink(request, repository!)
  if (url.pathname === "/api/sync" && request.method === "POST") return handleSyncPost(request, repository!)
  if (url.pathname === "/api/sync" && request.method === "GET") return handleSyncGet(request, repository!)
  return Response.json({ error: "unexpected test request" }, { status: 404 })
}
