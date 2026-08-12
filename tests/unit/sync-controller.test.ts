import "fake-indexeddb/auto"

import { webcrypto } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createSyncController } from "@/lib/client/sync-controller"
import { SyncClientStore } from "@/lib/sync/client-store"
import { RouteLibrary, type SavedRoute } from "@/lib/storage/route-library"

const resources: Array<{ store: SyncClientStore; routes: RouteLibrary }> = []

afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.store.destroy()
    await resource.routes.destroy()
  }
  localStorage.clear()
})

function route(id = "route-sync-1"): SavedRoute {
  return {
    id,
    name: "Sync route",
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

describe("sync controller", () => {
  it("pushes only saved routes and rider settings through the persistent outbox", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const store = new SyncClientStore(`switchback-sync-controller-${crypto.randomUUID()}`)
    const routes = new RouteLibrary(`switchback-sync-routes-${crypto.randomUUID()}`)
    resources.push({ store, routes })
    await store.ensureState().then(() => store.setLinked(true))
    await routes.upsertSynced(route())
    const posts: unknown[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/sync") && init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)))
        return Response.json({ accepted: true }, { status: 202 })
      }
      return Response.json({ envelopes: [], nextCursor: null })
    })

    const controller = createSyncController({ store, routeLibrary: routes, fetcher, sleep: async () => undefined })
    const result = await controller.sync()

    expect(result.pending).toBe(0)
    expect(posts).toHaveLength(2)
    expect(posts).toEqual(expect.arrayContaining([
      expect.objectContaining({ collection: "routes", objectId: "route-sync-1", updatedAt: route().updatedAt }),
      expect.objectContaining({ collection: "settings", objectId: "rider-settings" })
    ]))
    expect(JSON.stringify(posts)).not.toContain('"root"')
  })

  it("retries transient outbox failures with a bounded retry loop", async () => {
    vi.stubGlobal("crypto", webcrypto)
    const store = new SyncClientStore(`switchback-sync-controller-${crypto.randomUUID()}`)
    const routes = new RouteLibrary(`switchback-sync-routes-${crypto.randomUUID()}`)
    resources.push({ store, routes })
    await store.ensureState().then(() => store.setLinked(true))
    await routes.upsertSynced(route())
    let postAttempts = 0
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/sync") && init?.method === "POST") {
        postAttempts++
        if (postAttempts === 1) throw new Error("offline")
        return Response.json({ accepted: true }, { status: 202 })
      }
      return Response.json({ envelopes: [], nextCursor: null })
    })

    const result = await createSyncController({ store, routeLibrary: routes, fetcher, sleep: async () => undefined }).sync()

    expect(result.pending).toBe(0)
    expect(postAttempts).toBe(3)
  })
})
