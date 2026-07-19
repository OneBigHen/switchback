import "fake-indexeddb/auto"
import Dexie, { type EntityTable } from "dexie"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  DEFAULT_OFFLINE_ROUTE_PACK_EXPIRY_MILLIS,
  DEFAULT_OFFLINE_ROUTE_PACK_TTL_MILLIS,
  OFFLINE_ROUTE_PACK_SCHEMA_VERSION,
  OfflineRoutePackLibrary,
  estimateOfflineRoutePackBytes,
  getOfflineRoutePackExpiryState
} from "@/lib/storage/offline-route-pack"
import type { PlannedRoute } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "offline-route",
  name: "Offline ridge ride",
  profile: "twisty",
  geometry: [[-77, 40], [-76.8, 40.2]],
  waypoints: [{ lat: 40, lon: -77, label: "Start" }, { lat: 40.2, lon: -76.8, label: "Finish" }],
  instructions: [{ distanceMeters: 500, timeMilliseconds: 60_000, sign: 0, text: "Continue", streetName: "Ridge Road", interval: [0, 1] }],
  distanceMiles: 15,
  durationMinutes: 25,
  ascentMeters: 150,
  descentMeters: 120,
  twistiness: 71,
  turnCount: 15,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

describe("offline route packs", () => {
  let library: OfflineRoutePackLibrary

  beforeEach(() => {
    library = new OfflineRoutePackLibrary(`switchback-offline-${crypto.randomUUID()}`)
  })

  afterEach(async () => {
    await library.destroy()
  })

  it("keeps an immutable route, cues, and active map context locally for recovery", async () => {
    const pack = await library.save({
      route,
      mapStyle: "night",
      routeVisibility: "high-contrast",
      activeLayerIds: ["curvature", "weather"]
    })
    const restored = await library.get(pack.id)

    expect(restored).toMatchObject({
      routeId: route.id,
      routeName: route.name,
      mapStyle: "night",
      activeLayerIds: ["curvature", "weather"],
      navigationMode: "follow-saved-route"
    })
    expect(restored?.route.geometry).toEqual(route.geometry)
    expect(restored?.cues).toEqual(route.instructions)
  })

  it("does not package preview-only geometry as a misleading offline ride", async () => {
    await expect(library.save({
      route: { ...route, previewOnly: true },
      mapStyle: "clean",
      routeVisibility: "standard",
      activeLayerIds: []
    })).rejects.toThrow(/preview/i)
  })

  it("persists schema version, storage estimate, and expiry/freshness metadata on save", async () => {
    const ttlMillis = 1000 * 60 * 60 // 1 hour fresh window
    const expiryMillis = 1000 * 60 * 60 * 4 // 4 hours until expired
    const pack = await library.save({
      route,
      mapStyle: "night",
      routeVisibility: "standard",
      activeLayerIds: ["curvature"],
      freshnessTtlMillis: ttlMillis,
      freshnessExpiryMillis: expiryMillis
    })
    const restored = await library.get(pack.id)

    expect(restored).toBeDefined()
    expect(restored?.schemaVersion).toBe(OFFLINE_ROUTE_PACK_SCHEMA_VERSION)
    expect(restored?.freshness.ttlMillis).toBe(ttlMillis)
    expect(restored?.freshness.expiresAt).toBe(
      new Date(Date.parse(pack.updatedAt) + expiryMillis).toISOString()
    )
    const { estimatedBytes, ...rest } = restored!
    expect(estimatedBytes).toBe(estimateOfflineRoutePackBytes(rest))
    expect(estimatedBytes).toBeGreaterThan(0)
  })

  it("derives fresh, stale, and expired states from the freshness window", async () => {
    const ttlMillis = 1000 * 60 * 60 // 1 hour fresh
    const expiryMillis = 1000 * 60 * 60 * 4 // 4 hours until expired
    const pack = await library.save({
      route,
      mapStyle: "night",
      routeVisibility: "standard",
      activeLayerIds: [],
      freshnessTtlMillis: ttlMillis,
      freshnessExpiryMillis: expiryMillis
    })
    const updatedAtMs = Date.parse(pack.updatedAt)

    const fresh = getOfflineRoutePackExpiryState(pack, new Date(updatedAtMs + 30 * 60 * 1000))
    const stale = getOfflineRoutePackExpiryState(pack, new Date(updatedAtMs + ttlMillis + 60_000))
    const expired = getOfflineRoutePackExpiryState(pack, new Date(updatedAtMs + expiryMillis + 60_000))

    expect(fresh).toBe("fresh")
    expect(stale).toBe("stale")
    expect(expired).toBe("expired")
  })

  it("falls back to default freshness windows when none are provided", async () => {
    const pack = await library.save({
      route,
      mapStyle: "night",
      routeVisibility: "standard",
      activeLayerIds: []
    })
    expect(pack.freshness.ttlMillis).toBe(DEFAULT_OFFLINE_ROUTE_PACK_TTL_MILLIS)
    expect(pack.freshness.expiresAt).toBe(
      new Date(Date.parse(pack.updatedAt) + DEFAULT_OFFLINE_ROUTE_PACK_EXPIRY_MILLIS).toISOString()
    )
  })

  it("migrates version-one packs so existing saves remain readable", async () => {
    const name = `switchback-offline-migration-${crypto.randomUUID()}`
    const legacyUpdatedAt = "2025-01-02T00:00:00.000Z"

    // Persist a legacy v1 pack (no schema version, bytes estimate, or freshness).
    interface LegacyOfflineRoutePack {
      id: string
      routeId: string
      routeName: string
      createdAt: string
      updatedAt: string
      mapStyle: "night"
      routeVisibility: "standard" | "high-contrast"
      activeLayerIds: string[]
      route: PlannedRoute
      cues: RouteInstruction[]
      navigationMode: "follow-saved-route"
    }
    type RouteInstruction = PlannedRoute["instructions"][number]

    class LegacyDatabase extends Dexie {
      packs!: EntityTable<LegacyOfflineRoutePack, "id">

      constructor(databaseName: string) {
        super(databaseName)
        this.version(1).stores({ packs: "&id, routeId, updatedAt, createdAt" })
      }
    }

    const legacyDatabase = new LegacyDatabase(name)
    await legacyDatabase.open()
    await legacyDatabase.packs.put({
      id: "legacy-pack",
      routeId: route.id,
      routeName: route.name,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: legacyUpdatedAt,
      mapStyle: "night",
      routeVisibility: "standard",
      activeLayerIds: [],
      route,
      cues: route.instructions,
      navigationMode: "follow-saved-route"
    })
    legacyDatabase.close()

    // Opening the v2 library triggers the Dexie upgrade on the existing store.
    const migratedLibrary = new OfflineRoutePackLibrary(name)
    try {
      const restored = await migratedLibrary.get("legacy-pack")

      expect(restored).toBeDefined()
      expect(restored?.route.geometry).toEqual(route.geometry)
      expect(restored?.cues).toEqual(route.instructions)
      expect(restored?.navigationMode).toBe("follow-saved-route")
      // Migrated packs are stamped with the legacy schema version so callers can
      // distinguish them from freshly authored packs.
      expect(restored?.schemaVersion).toBe(1)
      expect(restored?.estimatedBytes).toBeGreaterThan(0)
      expect(restored?.freshness.ttlMillis).toBe(DEFAULT_OFFLINE_ROUTE_PACK_TTL_MILLIS)
      expect(restored?.freshness.expiresAt).toBe(
        new Date(Date.parse(legacyUpdatedAt) + DEFAULT_OFFLINE_ROUTE_PACK_EXPIRY_MILLIS).toISOString()
      )
      // The legacy pack is well past the default expiry window by now.
      expect(getOfflineRoutePackExpiryState(restored!)).toBe("expired")
    } finally {
      await migratedLibrary.destroy()
    }
  })
})
