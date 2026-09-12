import { describe, expect, it, vi } from "vitest"
import { createRouteExchangeActions } from "@/lib/client/route-exchange-actions"
import type { PlannedRoute } from "@/lib/routing/types"
import type { SavedRoute } from "@/lib/storage/route-library"

const route: PlannedRoute = {
  id: "route-1",
  name: "River run",
  profile: "scenic",
  geometry: [[-77, 40], [-76.9, 40.1]],
  waypoints: [{ lat: 40, lon: -77 }, { lat: 40.1, lon: -76.9 }],
  instructions: [],
  distanceMiles: 12,
  durationMinutes: 25,
  ascentMeters: null,
  descentMeters: null,
  twistiness: 30,
  turnCount: 8,
  roadMix: {},
  surfaceMix: {},
  routingSource: "live",
  previewOnly: false
}

function savedRoute(): SavedRoute {
  return {
    ...route,
    notes: "",
    folder: "Unfiled",
    tags: [],
    visible: true,
    libraryProvenance: { kind: "planned" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
}

function actions(overrides: Partial<Parameters<typeof createRouteExchangeActions>[0]> = {}) {
  const library = {
    save: vi.fn().mockResolvedValue(savedRoute()),
    remove: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    findCatalogCopy: vi.fn().mockResolvedValue(undefined)
  }
  const refresh = vi.fn().mockResolvedValue(undefined)
  const onNotice = vi.fn()
  const onLoad = vi.fn()
  return {
    library,
    refresh,
    onNotice,
    onLoad,
    actions: createRouteExchangeActions({
      library,
      refresh,
      onNotice,
      onLoad,
      parseFile: vi.fn().mockResolvedValue(route),
      fetcher: vi.fn(),
      ...overrides
    })
  }
}

describe("route exchange actions", () => {
  it("exports a cue GPX download and releases its object URL after the browser-safe delay", () => {
    vi.useFakeTimers()
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    const createObjectUrl = vi.fn(() => "blob:route-export")
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const subject = actions()

    subject.actions.exportRoute(route, "cues")

    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download="river-run-cues.gpx"]')).toBeNull()
    expect(subject.onNotice).toHaveBeenCalledWith({ kind: "success", message: "GPX cues exported." })
    vi.advanceTimersByTime(1_000)
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:route-export")

    click.mockRestore()
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl })
    vi.useRealTimers()
  })

  it("imports with the worker parser, persists the normalized route, and refreshes the library", async () => {
    const parseFile = vi.fn().mockResolvedValue(route)
    const subject = actions({ parseFile })
    const file = new File(["<gpx />"], "river.gpx", { type: "application/gpx+xml" })

    await subject.actions.importRoute(file)

    expect(parseFile).toHaveBeenCalledWith(file)
    expect(subject.library.save).toHaveBeenCalledWith(route)
    expect(subject.refresh).toHaveBeenCalledOnce()
    expect(subject.onNotice).toHaveBeenCalledWith({
      kind: "success",
      message: "River run imported to your library. Imported tracks stay intact until you choose to re-route them."
    })
  })

  it("rejects oversized imports before the worker is started", async () => {
    const parseFile = vi.fn()
    const subject = actions({ parseFile, maxImportBytes: 1 })
    const file = new File(["too large"], "river.gpx", { type: "application/gpx+xml" })

    await subject.actions.importRoute(file)

    expect(parseFile).not.toHaveBeenCalled()
    expect(subject.onNotice).toHaveBeenCalledWith({ kind: "warning", message: "Route imports must be 5 MB or smaller." })
  })

  it("opens a Route Library entry in the planner from its full detail without saving it", async () => {
    const catalogRoute = { ...route, id: "atlas-42", name: "Bald Eagle Loop", routingSource: "imported" as const }
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ...catalogRoute, story: {}, catalog: {}, poster: null })))
    const subject = actions({ fetcher })

    await subject.actions.openCatalogRoute("atlas-42")

    expect(fetcher).toHaveBeenCalledWith("/api/gpx-library?id=atlas-42", expect.anything())
    expect(subject.onLoad).toHaveBeenCalledWith(expect.objectContaining({ id: "atlas-42", name: "Bald Eagle Loop" }))
    expect(subject.library.save).not.toHaveBeenCalled()
    expect(subject.refresh).not.toHaveBeenCalled()
    expect(subject.onNotice).toHaveBeenCalledWith({
      kind: "success",
      message: "Bald Eagle Loop opened from the Route Library. It is not in My Rides until you save it."
    })
  })

  it("refuses to open a Route Library entry without real geometry", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ...route, id: "atlas-42", geometry: [[-77, 40]] })))
    const subject = actions({ fetcher })

    await subject.actions.openCatalogRoute("atlas-42")

    expect(subject.onLoad).not.toHaveBeenCalled()
    expect(subject.onNotice).toHaveBeenCalledWith(expect.objectContaining({ kind: "warning" }))
  })

  it("saves an opened Route Library entry as a catalog copy, never under the shared catalog id", async () => {
    const catalogRoute = { ...route, id: "atlas-42", name: "Bald Eagle Loop", routingSource: "imported" as const }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(catalogRoute)))
    const subject = actions({ fetcher })
    await subject.actions.openCatalogRoute("atlas-42")

    await subject.actions.saveRoute(catalogRoute)

    expect(subject.library.findCatalogCopy).toHaveBeenCalledWith("atlas-42")
    expect(subject.library.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "catalog-copy--atlas-42", name: "Bald Eagle Loop" }),
      "",
      { kind: "catalog-copy", sourceCatalogRouteId: "atlas-42" }
    )
    expect(subject.refresh).toHaveBeenCalled()
    expect(subject.onNotice).toHaveBeenLastCalledWith({ kind: "success", message: "Bald Eagle Loop saved to My Rides." })
  })

  it("does not create a second copy when the opened Route Library entry is already in My Rides", async () => {
    const catalogRoute = { ...route, id: "atlas-42", name: "Bald Eagle Loop", routingSource: "imported" as const }
    const existingCopy: SavedRoute = {
      ...savedRoute(),
      id: "catalog-copy--atlas-42",
      libraryProvenance: { kind: "catalog-copy", sourceCatalogRouteId: "atlas-42" }
    }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(catalogRoute)))
    const subject = actions({ fetcher })
    subject.library.findCatalogCopy.mockResolvedValue(existingCopy)
    await subject.actions.openCatalogRoute("atlas-42")

    await subject.actions.saveRoute(catalogRoute)

    expect(subject.library.save).not.toHaveBeenCalled()
    expect(subject.onNotice).toHaveBeenLastCalledWith({ kind: "success", message: "Bald Eagle Loop is already in My Rides." })
  })

  it("remembers opened Route Library entries across re-created actions when the caller owns the session set", async () => {
    const catalogRoute = { ...route, id: "atlas-42", name: "Bald Eagle Loop", routingSource: "imported" as const }
    const fetcher = vi.fn(async () => new Response(JSON.stringify(catalogRoute)))
    const openedCatalogRouteIds = new Set<string>()
    const firstRender = actions({ fetcher, openedCatalogRouteIds })
    await firstRender.actions.openCatalogRoute("atlas-42")

    const nextRender = actions({ openedCatalogRouteIds })
    await nextRender.actions.saveRoute(catalogRoute)

    expect(nextRender.library.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "catalog-copy--atlas-42" }),
      "",
      { kind: "catalog-copy", sourceCatalogRouteId: "atlas-42" }
    )
  })

  it("keeps ordinary planner saves as planned routes", async () => {
    const subject = actions()

    await subject.actions.saveRoute(route)

    expect(subject.library.findCatalogCopy).not.toHaveBeenCalled()
    expect(subject.library.save).toHaveBeenCalledWith(route)
  })

  it("opens a rider-owned saved copy by id and warns when it no longer exists", async () => {
    const existing = savedRoute()
    const subject = actions()
    subject.library.get.mockResolvedValueOnce(existing).mockResolvedValueOnce(undefined)

    await subject.actions.openSavedRoute(existing.id)
    expect(subject.onLoad).toHaveBeenCalledWith(existing)

    await subject.actions.openSavedRoute("gone")
    expect(subject.onNotice).toHaveBeenLastCalledWith({ kind: "warning", message: "That ride is no longer in My Rides on this device." })
  })

  it("creates a GPX download with the correct variant filename and schedules object-URL cleanup", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-export-url")
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL")
    vi.useFakeTimers()
    const clickSpy = vi.spyOn(HTMLElement.prototype, "click").mockImplementation(() => {})

    const subject = actions()
    subject.actions.exportRoute(route, "route")

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe("river-run-route.gpx")
    expect(anchor.href).toBe("blob:test-export-url")

    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000)
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-export-url")

    clickSpy.mockRestore()
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
    vi.useRealTimers()
  })
})
