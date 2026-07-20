import "fake-indexeddb/auto"
import { afterEach, describe, expect, it } from "vitest"
import type { PlannedRoute } from "@/lib/routing/types"
import type { OfflinePackManifest } from "@/lib/storage/offline-contracts"
import {
  OFFLINE_GRAPH_FORMAT_VERSION,
  isPackUsableForRouting,
  packStatusFromFreshness
} from "@/lib/storage/offline-contracts"
import {
  OFFLINE_ROUTE_PACK_SCHEMA_VERSION,
  OfflineRoutePackLibrary,
  migrateOfflineRoutePackV2toV3,
  type OfflineRoutePackV2Shape
} from "@/lib/storage/offline-route-pack"

const route: PlannedRoute = {
  id: "migration-route",
  name: "Migration ridge ride",
  profile: "twisty",
  geometry: [[-77, 40], [-76.8, 40.2], [-76.6, 40.1]],
  waypoints: [{ lat: 40, lon: -77, label: "Start" }, { lat: 40.1, lon: -76.6, label: "Finish" }],
  instructions: [
    {
      distanceMeters: 500,
      timeMilliseconds: 60_000,
      sign: 0,
      text: "Continue",
      streetName: "Ridge Road",
      interval: [0, 1]
    }
  ],
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

const v2Pack: OfflineRoutePackV2Shape = {
  id: "legacy-v2-pack",
  routeId: route.id,
  routeName: route.name,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z",
  mapStyle: "night",
  routeVisibility: "high-contrast",
  activeLayerIds: ["curvature", "weather"],
  route,
  cues: route.instructions,
  navigationMode: "follow-saved-route",
  schemaVersion: 2,
  estimatedBytes: 1024,
  freshness: {
    ttlMillis: 86_400_000,
    expiresAt: "2025-02-01T00:00:00.000Z"
  }
}

describe("offline route pack migration contracts", () => {
  let library: OfflineRoutePackLibrary | undefined

  afterEach(async () => {
    await library?.destroy()
    library = undefined
  })

  it("migrates v2 route/cue-only packs without losing existing saved route fields", () => {
    const migrated = migrateOfflineRoutePackV2toV3(v2Pack)

    expect(migrated).toMatchObject({
      id: v2Pack.id,
      routeId: v2Pack.routeId,
      routeName: v2Pack.routeName,
      createdAt: v2Pack.createdAt,
      updatedAt: v2Pack.updatedAt,
      mapStyle: v2Pack.mapStyle,
      routeVisibility: v2Pack.routeVisibility,
      activeLayerIds: v2Pack.activeLayerIds,
      navigationMode: "follow-saved-route",
      schemaVersion: OFFLINE_ROUTE_PACK_SCHEMA_VERSION,
      freshness: v2Pack.freshness
    })
    expect(migrated.route.geometry).toEqual(route.geometry)
    expect(migrated.cues).toEqual(route.instructions)
  })

  it("defaults migrated v2 records to follow-saved-route capability metadata", () => {
    const migrated = migrateOfflineRoutePackV2toV3(v2Pack)

    expect(migrated.routingCapability).toBe("follow-saved-route")
    expect(migrated.corridorWidthMeters).toBe(0)
    expect(migrated.maxGraphBudgetBytes).toBe(0)
    expect(migrated.legalAccessProvenance).toEqual([])
    expect(migrated.graphManifestVersion).toBeNull()
    expect(migrated.segmentsCount).toBe(0)
  })

  it("writes new packs as schema v3 follow-saved-route packs by default", async () => {
    library = new OfflineRoutePackLibrary(`switchback-offline-c1-${crypto.randomUUID()}`)

    const pack = await library.save({
      route,
      mapStyle: "night",
      routeVisibility: "standard",
      activeLayerIds: ["curvature"]
    })

    expect(pack.schemaVersion).toBe(OFFLINE_ROUTE_PACK_SCHEMA_VERSION)
    expect(pack.routingCapability).toBe("follow-saved-route")
    expect(pack.corridorWidthMeters).toBe(0)
    expect(pack.maxGraphBudgetBytes).toBe(0)
    expect(pack.graphManifestVersion).toBeNull()
    expect(pack.legalAccessProvenance).toEqual([])
    expect(pack.segmentsCount).toBe(0)
  })

  it("maps freshness windows to ready, stale, and expired pack statuses", () => {
    const updatedAt = "2025-01-01T00:00:00.000Z"
    const updatedAtMs = Date.parse(updatedAt)
    const ttlMillis = 60_000
    const expiryMillis = 120_000

    expect(packStatusFromFreshness(updatedAtMs + 30_000, updatedAt, ttlMillis, expiryMillis)).toBe("ready")
    expect(packStatusFromFreshness(updatedAtMs + 90_000, updatedAt, ttlMillis, expiryMillis)).toBe("stale")
    expect(packStatusFromFreshness(updatedAtMs + 180_000, updatedAt, ttlMillis, expiryMillis)).toBe("expired")
    expect(packStatusFromFreshness(updatedAtMs, "not-a-date", ttlMillis, expiryMillis)).toBe("expired")
  })

  it("only treats ready packs as usable for routing", () => {
    expect(isPackUsableForRouting("ready")).toBe(true)
    expect(isPackUsableForRouting("available")).toBe(false)
    expect(isPackUsableForRouting("downloading")).toBe(false)
    expect(isPackUsableForRouting("stale")).toBe(false)
    expect(isPackUsableForRouting("expired")).toBe(false)
    expect(isPackUsableForRouting("failed")).toBe(false)
    expect(isPackUsableForRouting("deleted")).toBe(false)
  })

  it("allows future in-corridor-routing manifests to carry graph provenance fields", () => {
    const manifest: OfflinePackManifest = {
      manifestVersion: OFFLINE_GRAPH_FORMAT_VERSION,
      id: "in-corridor-pack",
      routeId: route.id,
      routeName: route.name,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-02T00:00:00.000Z",
      corridorWidthMeters: 5000,
      maxGraphBudgetBytes: 25_000_000,
      sources: [
        {
          id: "osm-pa",
          sourceName: "OpenStreetMap Pennsylvania extract",
          sourceUrl: "https://www.openstreetmap.org/",
          licenseName: "ODbL 1.0",
          licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
          fetchedAt: "2025-01-02T00:00:00.000Z",
          version: "2025-01-01",
          byteSize: 12_000_000,
          isApproximate: false
        }
      ],
      graphManifestVersion: "osm-2025-01-01",
      legalAccessProvenance: [
        {
          source: "OpenStreetMap access tags",
          confidence: "approximate",
          notes: "Motorcycle access inferred from OSM tags."
        }
      ],
      expiresAt: "2025-02-01T00:00:00.000Z",
      status: "ready",
      estimatedBytes: 12_500_000,
      segments: [],
      routingCapability: "in-corridor-routing"
    }

    expect(manifest.routingCapability).toBe("in-corridor-routing")
    expect(manifest.status).toBe("ready")
    expect(manifest.segments).toEqual([])
    expect(manifest.legalAccessProvenance[0]?.confidence).toBe("approximate")
  })
})
