import "fake-indexeddb/auto"

import Dexie from "dexie"
import { afterEach, describe, expect, it } from "vitest"
import type { PlannedRoute } from "@/lib/routing/types"
import { RouteLibrary } from "@/lib/storage/route-library"

const databases = new Set<string>()

function databaseName(label: string): string {
  const name = `switchback-${label}-${Math.random().toString(36).slice(2)}`
  databases.add(name)
  return name
}

function plannedRoute(overrides: Partial<PlannedRoute> = {}): PlannedRoute {
  return {
    id: "route-1",
    name: "Bucks County loop",
    profile: "twisty",
    geometry: [[-75.14, 40.21], [-75.12, 40.24], [-75.08, 40.26]],
    waypoints: [],
    instructions: [],
    distanceMiles: 18.4,
    durationMinutes: 42,
    ascentMeters: 220,
    descentMeters: 215,
    twistiness: 71,
    turnCount: 48,
    roadMix: {},
    surfaceMix: {},
    routingSource: "live",
    previewOnly: false,
    ...overrides
  }
}

afterEach(async () => {
  for (const name of databases) {
    await Dexie.delete(name)
  }
  databases.clear()
})

describe("RouteLibrary provenance", () => {
  it("persists catalog-copy library provenance and finds the owned copy", async () => {
    const library = new RouteLibrary(databaseName("catalog-copy"))

    const saved = await library.save(plannedRoute(), "", {
      kind: "catalog-copy",
      sourceCatalogRouteId: "atlas-42"
    })

    expect(saved.libraryProvenance).toEqual({
      kind: "catalog-copy",
      sourceCatalogRouteId: "atlas-42"
    })
    expect((await library.findCatalogCopy("atlas-42"))?.id).toBe(saved.id)
    await library.destroy()
  })

  it("defaults new planned routes to planned library provenance", async () => {
    const library = new RouteLibrary(databaseName("planned"))

    const saved = await library.save(plannedRoute())

    expect(saved.libraryProvenance).toEqual({ kind: "planned" })
    await library.destroy()
  })

  it("keeps routing-provider provenance independent from library provenance", async () => {
    const library = new RouteLibrary(databaseName("routing-provenance"))
    const routingProvenance = {
      provider: "graphhopper" as const,
      version: "11.0",
      fallback: false
    }

    const saved = await library.save(plannedRoute({ provenance: routingProvenance }), "", {
      kind: "catalog-copy",
      sourceCatalogRouteId: "atlas-provider-proof"
    })

    expect(saved.provenance).toEqual(routingProvenance)
    expect(saved.libraryProvenance).toEqual({
      kind: "catalog-copy",
      sourceCatalogRouteId: "atlas-provider-proof"
    })
    await library.destroy()
  })

  it("migrates legacy v2 rows without changing route identity or geometry", async () => {
    const name = databaseName("legacy")
    const legacy = new Dexie(name)
    legacy.version(2).stores({
      routes: "&id, name, profile, folder, *tags, visible, createdAt, updatedAt"
    })
    await legacy.open()

    const route = plannedRoute()
    const geometry = structuredClone(route.geometry)
    await legacy.table("routes").put({
      ...route,
      notes: "",
      folder: "Unfiled",
      tags: [],
      visible: true,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z"
    })
    legacy.close()

    const library = new RouteLibrary(name)
    const migrated = await library.get(route.id)

    expect(migrated?.id).toBe(route.id)
    expect(migrated?.geometry).toEqual(geometry)
    expect(migrated?.libraryProvenance).toEqual({ kind: "planned" })
    await library.destroy()
  })
})
