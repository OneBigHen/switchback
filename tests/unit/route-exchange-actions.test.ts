import { describe, expect, it, vi } from "vitest"
import { createRouteExchangeActions } from "@/lib/client/route-exchange-actions"
import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
}

function actions(overrides: Partial<Parameters<typeof createRouteExchangeActions>[0]> = {}) {
  const library = {
    save: vi.fn().mockResolvedValue(savedRoute()),
    remove: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined)
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

  it("loads an existing project route locally without fetching it again", async () => {
    const existing = savedRoute()
    const summary: ProjectGpxRouteSummary = {
      id: existing.id,
      name: existing.name,
      sourceFile: "ride.gpx",
      sourceProject: "Test routes",
      sources: ["ride.gpx"],
      distanceMiles: 12,
      durationMinutes: 25,
      twistiness: 30,
      turnCount: 8
    }
    const subject = actions({ library: { save: vi.fn(), remove: vi.fn(), get: vi.fn().mockResolvedValue(existing) } })

    await subject.actions.loadProject(summary)

    expect(subject.onLoad).toHaveBeenCalledWith(existing)
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
