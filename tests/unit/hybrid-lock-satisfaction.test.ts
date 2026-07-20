import { describe, expect, it, vi } from "vitest"
import { createHybridRouteProvider } from "@/lib/routing/hybrid"
import type { RoutingResult } from "@/lib/routing/planner"
import { createManualRoadLock } from "@/lib/roads/road-locks"
import type { PlannedRoute, RouteRequest } from "@/lib/routing/types"
import type { RoadAccessSnapshot } from "@/lib/roads/road-access"
import type { Coordinate } from "@/lib/routing/types"

const accessibleSnapshot: RoadAccessSnapshot = {
  highwayClass: "secondary",
  motorcycleAccess: "yes",
  generalAccess: "yes",
  surface: "asphalt",
  smoothness: "good",
  tracktype: "unknown",
  maxweightTonnes: null,
  seasonalUndated: false,
  activeConditions: [],
  routable: true
}

function candidate(id: string, latitudeOffset = 0): PlannedRoute {
  return {
    id,
    name: id,
    profile: "twisty",
    geometry: [
      [-76.9, 40.2 + latitudeOffset],
      [-76.7, 40.3 + latitudeOffset]
    ],
    waypoints: [],
    instructions: [],
    distanceMiles: 20,
    durationMinutes: 35,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 50,
    turnCount: 12,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false
  }
}

const request: RouteRequest = {
  profile: "twisty",
  points: [{ lat: 40.2, lon: -76.9 }, { lat: 40.3, lon: -76.7 }]
}

function result(engine: "graphhopper" | "valhalla", routes: PlannedRoute[]): RoutingResult {
  return { engine, engineVersion: engine === "graphhopper" ? "11.0" : "3.8.2", routes }
}

const lockLine: Coordinate[] = [
  [-76.9, 40.2],
  [-76.7, 40.3]
]

function mustLock(displayName?: string) {
  return createManualRoadLock({
    mode: "must",
    displayName,
    edgeIds: ["edge-1"],
    geometry: lockLine,
    orderedAnchors: [lockLine[0]!, lockLine[1]!],
    accessSnapshot: accessibleSnapshot,
    sourceRegionId: "maryland",
    sourceGraphVersion: "gh-11-1"
  })
}

function preferLock(displayName?: string) {
  return createManualRoadLock({
    mode: "prefer",
    displayName,
    edgeIds: ["edge-pref"],
    geometry: lockLine,
    orderedAnchors: [lockLine[0]!, lockLine[1]!],
    accessSnapshot: accessibleSnapshot,
    sourceRegionId: "maryland",
    sourceGraphVersion: "gh-11-1"
  })
}

function findRouteSatisfaction(route: PlannedRoute, lockId: string) {
  return route.lockSatisfaction?.find((row) => row.lockId === lockId)
}

describe("hybrid route provider — lock satisfaction", () => {
  it("attaches lock satisfaction to every GraphHopper candidate when locks are carried", async () => {
    const provider = createHybridRouteProvider({
      graphHopper: vi.fn(async () => result("graphhopper", [candidate("gh-1"), candidate("gh-2", 0.02)]))
    })
    const lock = mustLock()
    const response = await provider({ ...request, roadLocks: [lock] })

    expect(response.routes).toHaveLength(2)
    for (const route of response.routes) {
      expect(route.lockSatisfaction).toBeDefined()
      expect(route.lockSatisfaction).toHaveLength(1)
      const row = findRouteSatisfaction(route, lock.id)
      expect(row).toBeDefined()
      expect(row!.mode).toBe("must")
    }
  })

  it("unions satisfaction across GraphHopper and Valhalla candidates", async () => {
    const provider = createHybridRouteProvider({
      graphHopper: vi.fn(async () => result("graphhopper", [candidate("gh-1")])),
      valhalla: vi.fn(async () => result("valhalla", [candidate("vh-1", 0.06)]))
    })
    const lock = preferLock()
    const response = await provider({ ...request, roadLocks: [lock] })

    expect(response.routes.map((r) => r.provider)).toEqual(["graphhopper", "valhalla"])
    for (const route of response.routes) {
      expect(route.lockSatisfaction).toBeDefined()
      expect(route.lockSatisfaction).toHaveLength(1)
      const row = findRouteSatisfaction(route, lock.id)
      expect(row).toBeDefined()
      expect(row!.mode).toBe("prefer")
    }
  })

  it("still attaches lock satisfaction when Valhalla fails", async () => {
    const provider = createHybridRouteProvider({
      graphHopper: vi.fn(async () => result("graphhopper", [candidate("gh-only")])),
      valhalla: vi.fn(async () => { throw new Error("Valhalla unavailable") })
    })
    const lock = mustLock()
    const response = await provider({ ...request, roadLocks: [lock] })

    expect(response.routes).toHaveLength(1)
    expect(response.routes[0]!.lockSatisfaction).toBeDefined()
    expect(findRouteSatisfaction(response.routes[0]!, lock.id)).toBeDefined()
    expect(response.warnings?.join(" ")).toMatch(/Valhalla.*unavailable/i)
  })

  it("omits lock satisfaction when the request carries no locks", async () => {
    const provider = createHybridRouteProvider({
      graphHopper: vi.fn(async () => result("graphhopper", [candidate("gh")])),
      valhalla: vi.fn(async () => result("valhalla", [candidate("vh", 0.06)]))
    })
    const response = await provider(request)

    expect(response.routes[0]!.lockSatisfaction).toBeUndefined()
  })

  it("reflects a missed must-lock corridor as an unresolved satisfaction row, not a silent drop", async () => {
    const farGeometry: Coordinate[] = [
      [-70.1, 41.0],
      [-70.0, 41.1]
    ]
    const lock = createManualRoadLock({
      mode: "must",
      displayName: "Eastern Connector",
      edgeIds: ["e-east"],
      geometry: farGeometry,
      orderedAnchors: [farGeometry[0]!, farGeometry[1]!],
      accessSnapshot: accessibleSnapshot,
      sourceRegionId: "maryland",
      sourceGraphVersion: "gh-11-1"
    })
    const provider = createHybridRouteProvider({
      graphHopper: vi.fn(async () => result("graphhopper", [candidate("gh")])),
      valhalla: vi.fn(async () => result("valhalla", [candidate("vh", 0.06)]))
    })

    const response = await provider({ ...request, roadLocks: [lock] })

    for (const route of response.routes) {
      const row = findRouteSatisfaction(route, lock.id)
      expect(row).toBeDefined()
      expect(row!.mode).toBe("must")
      expect(row!.satisfied).toBe(false)
      expect(row!.match.kind).toBe("unresolved")
    }
  })

  it("satisfies a lock whose corridor overlaps the on-graph candidate exactly and skips an off-corridor sibling", async () => {
    const provider = createHybridRouteProvider({
      graphHopper: vi.fn(async () => result("graphhopper", [candidate("gh")])),
      valhalla: vi.fn(async () => result("valhalla", [candidate("vh", 0.06)]))
    })
    const lock = mustLock()
    const response = await provider({ ...request, roadLocks: [lock] })

    const ghRow = findRouteSatisfaction(response.routes[0]!, lock.id)
    const vhRow = findRouteSatisfaction(response.routes[1]!, lock.id)
    expect(ghRow?.satisfied).toBe(true)
    expect(ghRow?.match.kind === "exact" || ghRow?.match.kind === "approximate").toBe(true)
    expect(vhRow?.satisfied).toBe(false)
    expect(vhRow?.match.kind).toBe("unresolved")
  })

  it("computes satisfaction on each candidate independently of the others", async () => {
    const onRoute = candidate("on-corridor")
    const offRoute: PlannedRoute = {
      ...candidate("off-corridor", 5),
      geometry: [[-95, 30], [-94, 31]]
    }
    const provider = createHybridRouteProvider({
      graphHopper: vi.fn(async () => result("graphhopper", [onRoute, offRoute]))
    })
    const lock = mustLock()
    const response = await provider({ ...request, roadLocks: [lock] })

    const onRow = findRouteSatisfaction(response.routes[0]!, lock.id)
    const offRow = findRouteSatisfaction(response.routes[1]!, lock.id)
    expect(onRow?.satisfied).toBe(true)
    expect(offRow?.satisfied).toBe(false)
    expect(offRow?.match.kind).toBe("unresolved")
  })
})
