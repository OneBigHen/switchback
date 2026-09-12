import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AtlasBrowser } from "@/app/gpx-library/AtlasBrowser"
import type { AtlasBrowseRoute } from "@/app/gpx-library/atlas-browse"

vi.mock("@/lib/client/near-me", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/client/near-me")>(),
  useNearMe: () => ({ anchor: null, status: "idle", located: false, requestLocation: vi.fn() })
}))

vi.mock("@/components/route-library/RouteLibraryActions", () => ({
  RouteLibraryActions: ({ catalogRouteId, canUseGeometry }: { catalogRouteId: string; canUseGeometry: boolean }) => (
    canUseGeometry ? <a href={`/?ride=${catalogRouteId}`}>Open in Planner</a> : <span>Geometry not retained</span>
  )
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
    paths: ["M0 0 L50 50"]
  })
]

function setWide(wide: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: wide,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn()
  })))
}

function renderBrowser() {
  return render(
    <AtlasBrowser
      routes={routes}
      regions={["New Jersey", "North-Central PA"]}
      ridingAreas={["Bald Eagle / Rothrock", "PA Wilds"]}
      routeCount={routes.length}
      totalMiles={152.9}
      updatedLabel="Updated Sep 9, 2026"
    />
  )
}

beforeEach(() => setWide(false))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Route Library browser", () => {
  it("shows a truthful card: clean name, distance, known duration only, real preview, region and riding area", () => {
    setWide(false)
    renderBrowser()

    const card = screen.getByRole("link", { name: /Bald Eagle Dual Sport/ })
    expect(card).toHaveAttribute("href", "/gpx-library/bald-eagle")
    expect(within(card).getByText("105 mi")).toBeInTheDocument()
    expect(card).not.toHaveTextContent(/\b0 min\b/)
    expect(within(card).getByText("North-Central PA · PA Wilds · Bald Eagle / Rothrock")).toBeInTheDocument()
    expect(card.querySelector("path")?.getAttribute("d")).toBe("M8 110 L35 60 L76 82 L92 12")

    const gap = screen.getByRole("link", { name: /Delaware Water Gap/ })
    expect(within(gap).getByText("1 hr 35 min")).toBeInTheDocument()
    expect(within(gap).getByText("New Jersey")).toBeInTheDocument()
  })

  it("demotes catalog totals to secondary metadata", () => {
    renderBrowser()

    expect(screen.getByText("2 rides")).toBeInTheDocument()
    const meta = screen.getByText(/153 mi in the shared collection/)
    expect(meta.closest(".atlas-catalog-meta")).not.toBeNull()
    expect(screen.queryByText(/2 imported rides/)).toBeNull()
  })

  it("filters by riding area and by region", () => {
    renderBrowser()

    fireEvent.change(screen.getByRole("combobox", { name: "Riding area" }), { target: { value: "PA Wilds" } })
    expect(screen.queryByRole("link", { name: /Delaware Water Gap/ })).toBeNull()
    expect(screen.getByRole("link", { name: /Bald Eagle Dual Sport/ })).toBeInTheDocument()

    fireEvent.change(screen.getByRole("combobox", { name: "Riding area" }), { target: { value: "" } })
    fireEvent.change(screen.getByRole("combobox", { name: "Region" }), { target: { value: "New Jersey" } })
    expect(screen.queryByRole("link", { name: /Bald Eagle Dual Sport/ })).toBeNull()
  })

  it("on wide screens previews the selected ride in a rail from summary data, without fetching full geometry", () => {
    setWide(true)
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    renderBrowser()

    const rail = screen.getByRole("complementary", { name: "Selected ride" })
    expect(within(rail).getByRole("heading", { name: "Bald Eagle Dual Sport" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Delaware Water Gap/ }))

    expect(within(rail).getByRole("heading", { name: "Delaware Water Gap" })).toBeInTheDocument()
    expect(within(rail).getByRole("link", { name: "Route details" })).toHaveAttribute("href", "/gpx-library/gap")
    expect(within(rail).getByRole("link", { name: "Open in Planner" })).toHaveAttribute("href", "/?ride=gap")
    expect(screen.getByRole("button", { name: /Delaware Water Gap/ })).toHaveAttribute("aria-pressed", "true")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("does not offer rail actions for poster art without retained geometry", () => {
    setWide(true)
    render(
      <AtlasBrowser
        routes={[route({ id: "preview", name: "Preview", title: "Preview", canUseGeometry: false })]}
        regions={[]}
        ridingAreas={[]}
        routeCount={1}
        totalMiles={10}
        updatedLabel={null}
      />
    )
    const rail = screen.getByRole("complementary", { name: "Selected ride" })
    expect(within(rail).queryByRole("link", { name: "Open in Planner" })).toBeNull()
    expect(within(rail).getByText("Geometry not retained")).toBeInTheDocument()
  })

  it("keeps phone drill-in navigation with no rail", () => {
    setWide(false)
    renderBrowser()

    expect(screen.queryByRole("complementary", { name: "Selected ride" })).toBeNull()
    expect(screen.getByRole("link", { name: /Delaware Water Gap/ })).toHaveAttribute("href", "/gpx-library/gap")
  })
})
