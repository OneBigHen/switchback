import "fake-indexeddb/auto"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CatalogRouteError,
  catalogCopyId,
  fetchCatalogRoute,
  saveCatalogRouteToMyRides
} from "@/lib/gpx/catalog-client"
import { RouteLibrary } from "@/lib/storage/route-library"

const libraries: RouteLibrary[] = []

afterEach(async () => {
  await Promise.all(libraries.splice(0).map((library) => library.destroy()))
})

function library(): RouteLibrary {
  const created = new RouteLibrary(`catalog-save-${crypto.randomUUID()}`)
  libraries.push(created)
  return created
}

function detail(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "atlas-42",
    name: "Bald Eagle Dual Sport Loop",
    profile: "motorcycle",
    geometry: [[-77.9, 40.75], [-77.5, 40.9], [-77.25, 41.1]],
    waypoints: [],
    instructions: [],
    distanceMiles: 104.7,
    durationMinutes: 0,
    ascentMeters: 1200,
    descentMeters: 1200,
    twistiness: 62,
    turnCount: 118,
    roadMix: {},
    surfaceMix: {},
    routingSource: "imported",
    navigationMode: "track-only",
    previewOnly: false,
    story: { title: "Bald Eagle Dual Sport Loop", summary: "", body: "", tone: "Big ride" },
    catalog: { durationMinutes: null, area: { region: "North-Central PA", ridingAreas: [] } },
    poster: null,
    ...over
  }
}

function fetcherFor(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }))
}

describe("fetchCatalogRoute", () => {
  it("fetches the full detail record and returns a planner-ready route without catalog presentation fields", async () => {
    const fetcher = fetcherFor(detail())
    const route = await fetchCatalogRoute("atlas-42", fetcher)
    expect(fetcher).toHaveBeenCalledWith("/api/gpx-library?id=atlas-42", expect.objectContaining({ cache: "no-store" }))
    expect(route.id).toBe("atlas-42")
    expect(route.geometry).toHaveLength(3)
    expect(route).not.toHaveProperty("story")
    expect(route).not.toHaveProperty("catalog")
    expect(route).not.toHaveProperty("poster")
  })

  it.each([
    ["missing geometry", detail({ geometry: undefined })],
    ["a single coordinate", detail({ geometry: [[-77.9, 40.75]] })],
    ["non-finite coordinates", detail({ geometry: [[-77.9, 40.75], [Number.NaN, 41]] })],
    ["out-of-range coordinates", detail({ geometry: [[-77.9, 40.75], [-277, 41]] })],
    ["preview-only geometry", detail({ previewOnly: true })],
    ["a mismatched id", detail({ id: "someone-else" })],
    ["a missing name", detail({ name: 12 })],
    ["missing waypoints", detail({ waypoints: undefined })]
  ])("rejects %s", async (_label, body) => {
    await expect(fetchCatalogRoute("atlas-42", fetcherFor(body))).rejects.toBeInstanceOf(CatalogRouteError)
  })

  it("rejects unsafe ids before touching the network and surfaces HTTP failures", async () => {
    const fetcher = fetcherFor(detail())
    await expect(fetchCatalogRoute("../etc/passwd", fetcher)).rejects.toBeInstanceOf(CatalogRouteError)
    expect(fetcher).not.toHaveBeenCalled()
    await expect(fetchCatalogRoute("atlas-42", fetcherFor({ error: {} }, 404))).rejects.toBeInstanceOf(CatalogRouteError)
  })
})

describe("saveCatalogRouteToMyRides", () => {
  it("creates exactly one owned catalog copy with explicit provenance from real geometry", async () => {
    const rides = library()
    const fetcher = fetcherFor(detail())

    const result = await saveCatalogRouteToMyRides(rides, "atlas-42", fetcher)

    expect(result.created).toBe(true)
    expect(result.route.id).toBe(catalogCopyId("atlas-42"))
    expect(result.route.id).not.toBe("atlas-42")
    expect(result.route.libraryProvenance).toEqual({ kind: "catalog-copy", sourceCatalogRouteId: "atlas-42" })
    expect(result.route.geometry).toEqual(detail().geometry)
    expect(await rides.list()).toHaveLength(1)
  })

  it("is duplicate-safe: a second save reuses the existing owned copy without refetching", async () => {
    const rides = library()
    const first = await saveCatalogRouteToMyRides(rides, "atlas-42", fetcherFor(detail()))
    const secondFetcher = fetcherFor(detail())

    const second = await saveCatalogRouteToMyRides(rides, "atlas-42", secondFetcher)

    expect(second.created).toBe(false)
    expect(second.route.id).toBe(first.route.id)
    expect(secondFetcher).not.toHaveBeenCalled()
    expect(await rides.list()).toHaveLength(1)
  })

  it("stays duplicate-safe when two saves race", async () => {
    const rides = library()
    await Promise.all([
      saveCatalogRouteToMyRides(rides, "atlas-42", fetcherFor(detail())),
      saveCatalogRouteToMyRides(rides, "atlas-42", fetcherFor(detail()))
    ])
    expect(await rides.list()).toHaveLength(1)
  })

  it("never persists preview-only or invalid geometry", async () => {
    const rides = library()
    await expect(saveCatalogRouteToMyRides(rides, "atlas-42", fetcherFor(detail({ previewOnly: true }))))
      .rejects.toBeInstanceOf(CatalogRouteError)
    await expect(saveCatalogRouteToMyRides(rides, "atlas-42", fetcherFor(detail({ geometry: [[-77.9, 40.75]] }))))
      .rejects.toBeInstanceOf(CatalogRouteError)
    expect(await rides.list()).toEqual([])
  })

  it("does not treat an ordinary planned route that happens to share the catalog id as a saved copy", async () => {
    const rides = library()
    const planned = await fetchCatalogRoute("atlas-42", fetcherFor(detail()))
    await rides.save(planned)

    const result = await saveCatalogRouteToMyRides(rides, "atlas-42", fetcherFor(detail()))

    expect(result.created).toBe(true)
    expect(result.route.libraryProvenance).toEqual({ kind: "catalog-copy", sourceCatalogRouteId: "atlas-42" })
  })
})
