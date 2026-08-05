import { describe, expect, it } from "vitest"
import type { OfflineGraph } from "@/lib/offline/graph"
import type { OfflineRoutePack } from "@/lib/storage/offline-route-pack"
import type { PlannedRoute, Waypoint } from "@/lib/routing/types"
import { recoverRouteFromOfflinePack } from "@/lib/client/offline-route-recovery"

const graph: OfflineGraph = {
  schemaVersion: 1,
  nodes: [
    { index: 0, coordinate: [-76, 40] },
    { index: 1, coordinate: [-75.99, 40] },
    { index: 2, coordinate: [-75.98, 40] }
  ],
  edges: [
    { id: "ab", from: 0, to: 1, lengthMeters: 850, restrictions: [] },
    { id: "bc", from: 1, to: 2, lengthMeters: 850, restrictions: [] }
  ],
  shapingPoints: []
}

const route: PlannedRoute = {
  id: "saved-route",
  name: "Ridge ride",
  profile: "twisty",
  geometry: graph.nodes.map((node) => node.coordinate),
  waypoints: [
    { lon: -76, lat: 40, label: "Start" },
    { lon: -75.98, lat: 40, label: "Finish" }
  ],
  instructions: [],
  distanceMiles: 1.1,
  durationMinutes: 20,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 70,
  turnCount: 2,
  roadMix: { secondary: 100 },
  surfaceMix: { asphalt: 100 },
  routingSource: "live",
  previewOnly: false
}

const points: Waypoint[] = [
  { lon: -76, lat: 40, label: "Current position" },
  { lon: -75.98, lat: 40, label: "Rejoin" }
]

function pack(overrides: Partial<OfflineRoutePack> = {}): OfflineRoutePack {
  const updatedAt = "2026-08-04T12:00:00.000Z"
  return {
    id: "saved-route-offline",
    routeId: route.id,
    routeName: route.name,
    createdAt: updatedAt,
    updatedAt,
    mapStyle: "clean",
    routeVisibility: "standard",
    activeLayerIds: [],
    route,
    cues: [],
    navigationMode: "follow-saved-route",
    schemaVersion: 3,
    estimatedBytes: 100,
    freshness: { ttlMillis: 7 * 24 * 60 * 60 * 1000, expiresAt: "2026-09-03T12:00:00.000Z" },
    routingCapability: "in-corridor-routing",
    corridorWidthMeters: 250,
    maxGraphBudgetBytes: 5000,
    graphManifestVersion: "test",
    legalAccessProvenance: [],
    segmentsCount: 1,
    corridorGraph: JSON.stringify(graph),
    ...overrides
  }
}

describe("offline route recovery", () => {
  it("rebuilds a legal route from a saved corridor without a network", () => {
    const recovered = recoverRouteFromOfflinePack(pack(), points, new Date("2026-08-04T13:00:00.000Z"))
    expect(recovered.error).toBeNull()
    expect(recovered.route).toMatchObject({
      id: "saved-route-offline-recovery",
      name: "Ridge ride · Offline recovery",
      routingSource: "imported",
      instructions: [{ text: "Follow the offline corridor" }]
    })
    expect(recovered.route?.geometry).toEqual(graph.nodes.map((node) => node.coordinate))
  })

  it("refuses an expired or out-of-corridor pack instead of fabricating a line", () => {
    expect(recoverRouteFromOfflinePack(pack({
      freshness: { ttlMillis: 1, expiresAt: "2026-08-04T12:01:00.000Z" }
    }), points, new Date("2026-08-04T13:00:00.000Z"))).toMatchObject({
      route: null,
      error: "The saved offline route pack has expired."
    })
    expect(recoverRouteFromOfflinePack(pack(), [
      { lon: -75, lat: 40, label: "Outside" },
      points[1]!
    ], new Date("2026-08-04T13:00:00.000Z"))).toMatchObject({
      route: null
    })
  })
})
