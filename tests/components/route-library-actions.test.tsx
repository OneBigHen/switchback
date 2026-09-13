import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RouteLibraryActions } from "@/components/route-library/RouteLibraryActions"
import type { CatalogCopyLibrary } from "@/lib/gpx/catalog-client"
import type { SavedRoute } from "@/lib/storage/route-library"

afterEach(cleanup)

const geometry = [[-77.9, 40.75], [-77.5, 40.9]]

function detailResponse(over: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    id: "atlas-42",
    name: "Bald Eagle Loop",
    profile: "motorcycle",
    geometry,
    waypoints: [],
    instructions: [],
    distanceMiles: 104.7,
    durationMinutes: 0,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 62,
    turnCount: 118,
    roadMix: {},
    surfaceMix: {},
    routingSource: "imported",
    previewOnly: false,
    ...over
  }))
}

function ownedCopy(): SavedRoute {
  return {
    id: "catalog-copy--atlas-42",
    name: "Bald Eagle Loop",
    profile: "scenic",
    geometry: geometry as SavedRoute["geometry"],
    waypoints: [],
    instructions: [],
    distanceMiles: 104.7,
    durationMinutes: 0,
    ascentMeters: null,
    descentMeters: null,
    twistiness: 62,
    turnCount: 118,
    roadMix: {},
    surfaceMix: {},
    routingSource: "imported",
    previewOnly: false,
    notes: "",
    folder: "Unfiled",
    tags: [],
    visible: true,
    libraryProvenance: { kind: "catalog-copy", sourceCatalogRouteId: "atlas-42" },
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z"
  }
}

function fakeLibrary(existing?: SavedRoute) {
  let stored = existing
  const library = {
    findCatalogCopy: vi.fn(async () => stored),
    save: vi.fn(async (route, _notes, provenance) => {
      stored = { ...ownedCopy(), ...route, libraryProvenance: provenance }
      return stored!
    })
  } satisfies CatalogCopyLibrary
  return library
}

describe("RouteLibraryActions", () => {
  it("offers Open in Planner as a navigation that never saves", async () => {
    const library = fakeLibrary()
    const fetcher = vi.fn()
    render(<RouteLibraryActions catalogRouteId="atlas-42" routeName="Bald Eagle Loop" canUseGeometry library={library} fetcher={fetcher} />)

    const open = screen.getByRole("link", { name: "Open in Planner" })
    expect(open).toHaveAttribute("href", "/?ride=atlas-42")
    fireEvent.click(open)

    await screen.findByRole("button", { name: "Save to My Rides" })
    expect(library.save).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("saves explicitly, then offers the owned copy", async () => {
    const library = fakeLibrary()
    const fetcher = vi.fn(async () => detailResponse())
    render(<RouteLibraryActions catalogRouteId="atlas-42" routeName="Bald Eagle Loop" canUseGeometry library={library} fetcher={fetcher} />)

    fireEvent.click(await screen.findByRole("button", { name: "Save to My Rides" }))

    expect(await screen.findByRole("status")).toHaveTextContent("Saved to My Rides")
    expect(screen.getByRole("link", { name: "Open saved copy" })).toHaveAttribute("href", "/?savedRoute=catalog-copy--atlas-42")
    expect(screen.queryByRole("button", { name: "Save to My Rides" })).toBeNull()
    expect(library.save).toHaveBeenCalledTimes(1)
    expect(library.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "catalog-copy--atlas-42" }),
      "",
      { kind: "catalog-copy", sourceCatalogRouteId: "atlas-42" }
    )
  })

  it("recognises an existing owned copy instead of offering a duplicate save", async () => {
    const library = fakeLibrary(ownedCopy())
    render(<RouteLibraryActions catalogRouteId="atlas-42" routeName="Bald Eagle Loop" canUseGeometry library={library} fetcher={vi.fn()} />)

    expect(await screen.findByRole("status")).toHaveTextContent("Already in My Rides")
    expect(screen.getByRole("link", { name: "Open saved copy" })).toHaveAttribute("href", "/?savedRoute=catalog-copy--atlas-42")
    expect(screen.queryByRole("button", { name: "Save to My Rides" })).toBeNull()
  })

  it("reports a refused save without persisting preview-only geometry", async () => {
    const library = fakeLibrary()
    const fetcher = vi.fn(async () => detailResponse({ previewOnly: true }))
    render(<RouteLibraryActions catalogRouteId="atlas-42" routeName="Bald Eagle Loop" canUseGeometry library={library} fetcher={fetcher} />)

    fireEvent.click(await screen.findByRole("button", { name: "Save to My Rides" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/preview/i)
    expect(library.save).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Save to My Rides" })).toBeEnabled()
  })

  it("disables both actions when the catalog kept no usable geometry", async () => {
    const library = fakeLibrary()
    render(<RouteLibraryActions catalogRouteId="atlas-42" routeName="Bald Eagle Loop" canUseGeometry={false} library={library} fetcher={vi.fn()} />)

    expect(screen.queryByRole("link", { name: "Open in Planner" })).toBeNull()
    expect(screen.getByText("Geometry not retained")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("button", { name: "Save to My Rides" })).toBeDisabled())
  })

  it("says so when My Rides storage is unavailable in this browser", async () => {
    const library = {
      findCatalogCopy: vi.fn(async () => { throw new Error("IndexedDB blocked") }),
      save: vi.fn()
    }
    render(<RouteLibraryActions catalogRouteId="atlas-42" routeName="Bald Eagle Loop" canUseGeometry library={library} fetcher={vi.fn()} />)

    expect(await screen.findByRole("alert")).toHaveTextContent("My Rides is not available in this browser")
    expect(screen.getByRole("button", { name: "Save to My Rides" })).toBeDisabled()
  })
})
