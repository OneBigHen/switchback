import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AtlasBrowser } from "@/app/gpx-library/AtlasBrowser"
import type { AtlasBrowseRoute } from "@/app/gpx-library/atlas-browse"
import { telemetry } from "@/lib/telemetry/client"

vi.mock("@/lib/client/near-me", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/client/near-me")>(),
  useNearMe: () => ({ anchor: null, status: "idle", located: false, requestLocation: vi.fn() })
}))

// The discovery map is a WebGL workspace with its own coverage; this suite is
// about the browse contract, not about MapLibre.
vi.mock("@/components/route-library/RouteLibraryMap", () => ({
  RouteLibraryMap: ({ routes, selectedId }: { routes: Array<{ id: string }>; selectedId: string | null }) => (
    <div data-testid="discovery-map" data-route-count={routes.length} data-selected={selectedId ?? ""} />
  )
}))

// The shared preview renderer owns one off-screen map; in jsdom it simply
// reports that it cannot run, which is the state the fallback plate covers.
vi.mock("@/components/route-library/route-preview-renderer", () => ({
  requestRoutePreview: () => Promise.resolve(null),
  cachedRoutePreview: () => null,
  routePreviewRendererState: () => "unavailable",
  resetRoutePreviewRenderer: () => undefined
}))

vi.mock("@/components/route-library/use-saved-catalog-routes", () => ({
  useSavedCatalogRoutes: () => ({ ids: new Set(["bald-eagle"]), ready: true, refresh: vi.fn() })
}))

function route(over: Partial<AtlasBrowseRoute> & { id: string }): AtlasBrowseRoute {
  return {
    name: "Route",
    title: "Route",
    tone: "Mid-distance",
    band: "twisty",
    distanceMiles: 104.7,
    durationMinutes: null,
    turnCount: 118,
    twistiness: 62,
    unpavedShare: null,
    profile: null,
    bbox: [-77.9, 40.75, -77.25, 41.1],
    region: "North-Central PA",
    ridingAreas: ["PA Wilds", "Bald Eagle / Rothrock"],
    aspect: 1,
    paths: ["M8 110 L35 60 L76 82 L92 12"],
    start: [8, 110],
    end: [92, 12],
    canUseGeometry: true,
    ...over
  }
}

const routes: AtlasBrowseRoute[] = [
  route({ id: "bald-eagle", name: "Bald Eagle Dual Sport", title: "Bald Eagle Dual Sport" }),
  route({
    id: "gap",
    name: "Delaware Water Gap",
    title: "Delaware Water Gap",
    distanceMiles: 48.2,
    durationMinutes: 95,
    region: "New Jersey",
    ridingAreas: [],
    bbox: [-75.15, 40.9, -74.95, 41.1],
    paths: ["M10 110 L50 50 L90 14"]
  })
]

function setMatchMedia(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn()
  })))
}

function renderBrowser(override: Partial<Parameters<typeof AtlasBrowser>[0]> = {}) {
  return render(
    <AtlasBrowser
      routes={routes}
      regions={["New Jersey", "North-Central PA"]}
      ridingAreas={["Bald Eagle / Rothrock", "PA Wilds"]}
      routeCount={routes.length}
      totalMiles={152.9}
      updatedLabel="Updated Sep 9, 2026"
      {...override}
    />
  )
}

function openFilters() {
  fireEvent.click(screen.getByRole("button", { name: /Filters/ }))
}

beforeEach(() => setMatchMedia(false))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("GPX Library discovery", () => {
  it("names the collection and states its real size", () => {
    renderBrowser()

    expect(screen.getByRole("heading", { name: "GPX Library" })).toBeInTheDocument()
    expect(screen.getByText(/2 routes · 153 miles · Updated Sep 9, 2026/)).toBeInTheDocument()
  })

  it("records library entry and bounded filter changes without search text", () => {
    const capture = vi.spyOn(telemetry, "capture")
    renderBrowser()

    expect(capture).toHaveBeenCalledWith("gpx_library_opened", expect.objectContaining({
      source_class: "catalog",
      format: "gpx",
      route_count_band: "2-3"
    }))

    openFilters()
    fireEvent.click(screen.getByRole("button", { name: "Under 50 mi" }))

    expect(capture).toHaveBeenCalledWith("gpx_filter_changed", expect.objectContaining({
      source_class: "catalog",
      filter_kind: "length",
      filter_state: "applied",
      active_filter_count: 1
    }))
    expect(JSON.stringify(capture.mock.calls)).not.toContain("Water Gap")
  })

  it("shows a truthful card: clean name, distance, known duration only, area and saved state", () => {
    renderBrowser()

    const card = screen.getByRole("link", { name: /Bald Eagle Dual Sport/ })
    expect(card).toHaveAttribute("href", "/gpx-library/bald-eagle")
    expect(within(card).getByText("105 mi")).toBeInTheDocument()
    expect(card).not.toHaveTextContent(/\b0 min\b/)
    expect(within(card).getByText("North-Central PA · PA Wilds · Bald Eagle / Rothrock")).toBeInTheDocument()
    expect(within(card).getByText("Saved to your rides")).toBeInTheDocument()

    const gap = screen.getByRole("link", { name: /Delaware Water Gap/ })
    expect(within(gap).getByText("1 hr 35 min")).toBeInTheDocument()
    expect(within(gap).getByText("New Jersey")).toBeInTheDocument()
    expect(within(gap).queryByText("Saved to your rides")).toBeNull()
  })

  it("marks a distance-derived time as an estimate rather than showing it as recorded", () => {
    renderBrowser()

    const card = screen.getByRole("link", { name: /Bald Eagle Dual Sport/ })
    const estimated = within(card).getByText("est")

    expect(estimated).toBeInTheDocument()
    expect(within(screen.getByRole("link", { name: /Delaware Water Gap/ })).queryByText("est")).toBeNull()
  })

  it("gives every card geography, not an abstract route silhouette", () => {
    renderBrowser()

    const card = screen.getByRole("link", { name: /Bald Eagle Dual Sport/ })
    const preview = card.querySelector("[data-route-preview]")

    expect(preview).not.toBeNull()
    // The plate is projected from the route's real bbox, so its path is not
    // the atlas viewBox art the card used to draw.
    expect(card.querySelector("[data-route-line]")?.getAttribute("d"))
      .not.toBe("M8 110 L35 60 L76 82 L92 12")
    expect(within(card).getByRole("img", { name: "Map of Bald Eagle Dual Sport" })).toBeInTheDocument()
  })

  it("says a route is unplaceable rather than drawing it somewhere", () => {
    renderBrowser({
      routes: [route({ id: "no-geo", title: "No geography", bbox: null, paths: [] })],
      routeCount: 1
    })

    expect(screen.getByText("Location unknown")).toBeInTheDocument()
  })

  it("does not lead with mapped turn counts", () => {
    renderBrowser()

    expect(screen.queryByText(/118 turns/)).toBeNull()
  })

  it("keeps region and riding-area filtering, now behind Filters", () => {
    renderBrowser()
    openFilters()

    fireEvent.change(screen.getByRole("combobox", { name: "Riding area" }), { target: { value: "PA Wilds" } })
    expect(screen.queryByRole("link", { name: /Delaware Water Gap/ })).toBeNull()
    expect(screen.getByRole("link", { name: /Bald Eagle Dual Sport/ })).toBeInTheDocument()

    fireEvent.change(screen.getByRole("combobox", { name: "Riding area" }), { target: { value: "" } })
    fireEvent.change(screen.getByRole("combobox", { name: "Region" }), { target: { value: "New Jersey" } })
    expect(screen.queryByRole("link", { name: /Bald Eagle Dual Sport/ })).toBeNull()
  })

  it("keeps ride-length and corner filtering available", () => {
    renderBrowser()
    openFilters()

    fireEvent.click(screen.getByRole("button", { name: "Under 50 mi" }))

    expect(screen.getByRole("link", { name: /Delaware Water Gap/ })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Bald Eagle Dual Sport/ })).toBeNull()
  })

  it("offers Map and List as two presentations of one query", () => {
    renderBrowser()

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Water Gap" } })
    expect(screen.getByText("1 route matching “Water Gap”")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Map" }))

    const map = screen.getByTestId("discovery-map")
    expect(map).toHaveAttribute("data-route-count", "1")
    expect(screen.getByRole("button", { name: /Delaware Water Gap — show on map/ })).toBeInTheDocument()
  })

  it("synchronises card selection with the map", () => {
    renderBrowser()
    fireEvent.click(screen.getByRole("button", { name: "Map" }))

    const card = screen.getByRole("button", { name: /Delaware Water Gap — show on map/ })
    fireEvent.click(card)

    expect(card).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("discovery-map")).toHaveAttribute("data-selected", "gap")
  })

  it("disables a quick filter the collection cannot satisfy instead of returning nothing", () => {
    renderBrowser()

    const gravel = screen.getByRole("button", { name: "Gravel" })

    expect(gravel).toBeDisabled()
    expect(gravel).toHaveAttribute("title", expect.stringMatching(/surface evidence/i))
  })

  it("applies a quick filter the collection can satisfy", () => {
    renderBrowser({
      routes: [
        route({ id: "adv", title: "Adventure ride", profile: "adventure" }),
        route({ id: "scenic", title: "Scenic ride", profile: "scenic" })
      ]
    })

    fireEvent.click(screen.getByRole("button", { name: "Gravel" }))

    expect(screen.getByRole("link", { name: /Adventure ride/ })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Scenic ride/ })).toBeNull()
  })

  it("browses without fetching any route geometry", () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    renderBrowser()
    fireEvent.click(screen.getByRole("button", { name: "Map" }))

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("explains an empty result rather than showing a blank deck", () => {
    renderBrowser()

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nothing matches this" } })

    expect(screen.getByText("No routes match those filters.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument()
  })
})
