import { useState } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LibraryDrawer } from "@/components/planner/LibraryDrawer"
import type { ProjectGpxRouteSummary } from "@/lib/gpx/catalog"
import type { SavedRoute } from "@/lib/storage/route-library"
import type { TripPlan } from "@/lib/trip/trip-plan"

const savedRoute: SavedRoute = {
  id: "saved-loop",
  name: "Sunday loop",
  profile: "twisty",
  geometry: [[-76.9, 40.2], [-76.8, 40.3]],
  waypoints: [
    { lat: 40.2, lon: -76.9, label: "Start" },
    { lat: 40.3, lon: -76.8, label: "Finish" }
  ],
  instructions: [],
  distanceMiles: 42.5,
  durationMinutes: 68,
  ascentMeters: 320,
  descentMeters: 300,
  twistiness: 78,
  turnCount: 24,
  roadMix: { secondary: 80, primary: 20 },
  surfaceMix: { asphalt: 100 },
  routingSource: "live",
  previewOnly: false,
  notes: "",
  folder: "Unfiled",
  tags: [],
  visible: true,
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z"
}

const projectRoute: ProjectGpxRouteSummary = {
  id: "project-gpx-ridge",
  name: "Pine Ridge Ramble",
  distanceMiles: 86.4,
  durationMinutes: 130,
  twistiness: 82,
  turnCount: 48,
  sourceProject: "LongWay",
  sourceFile: "LongWay/public/gpx/pine-ridge.gpx",
  sources: ["LongWay/public/gpx/pine-ridge.gpx"]
}

const savedTrip: TripPlan = {
  version: 2,
  id: "trip-long-ridge",
  routeId: savedRoute.id,
  name: "Long Ridge Weekend",
  route: savedRoute,
  constraints: { targetDayMinutes: 300, fuelRangeMiles: 140, fuelReserveMiles: 25, breakEveryMinutes: 90, daylightMinutes: 270 },
  stages: [],
  warnings: [],
  createdAt: "2026-07-18T12:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z"
}

afterEach(cleanup)

describe("ride library drawer", () => {
  it("loads a locally saved multi-day trip from its own library section", async () => {
    const user = userEvent.setup()
    const onLoadTrip = vi.fn()

    render(
      <LibraryDrawer
        routes={[]}
        trips={[savedTrip]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onLoadTrip={onLoadTrip}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    expect(screen.getByText("Saved trips")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Load saved trip Long Ridge Weekend" }))
    expect(onLoadTrip).toHaveBeenCalledWith(savedTrip)
  })

  it("searches and requires confirmation before deleting a saved trip", async () => {
    const user = userEvent.setup()
    const onDeleteTrip = vi.fn()
    render(
      <LibraryDrawer
        routes={[]}
        trips={[savedTrip]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDeleteTrip={onDeleteTrip}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    await user.type(screen.getByRole("searchbox", { name: "Search ride library" }), "missing")
    expect(screen.queryByText(savedTrip.name)).not.toBeInTheDocument()
    await user.clear(screen.getByRole("searchbox", { name: "Search ride library" }))
    await user.click(screen.getByRole("button", { name: `Delete saved trip ${savedTrip.name}` }))
    expect(onDeleteTrip).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: `Confirm delete saved trip ${savedTrip.name}` }))
    expect(onDeleteTrip).toHaveBeenCalledWith(savedTrip)
  })

  it("manages modal focus, traps Tab, closes with Escape, and restores the opener", async () => {
    const user = userEvent.setup()

    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <main>
          <button type="button" onClick={() => setOpen(true)}>Open library</button>
          <section aria-label="Map">Map</section>
          {open ? (
            <LibraryDrawer
              routes={[]}
              onClose={() => setOpen(false)}
              onLoad={vi.fn()}
              onDelete={vi.fn()}
              onImport={vi.fn()}
            />
          ) : null}
        </main>
      )
    }

    render(<Harness />)
    const opener = screen.getByRole("button", { name: "Open library" })
    await user.click(opener)

    const close = screen.getByRole("button", { name: "Close library" })
    const importer = screen.getByLabelText("Import GPX, KML, or KMZ file")
    expect(importer).toBeInTheDocument()
    expect(close).toHaveFocus()
    expect(opener).toHaveAttribute("aria-hidden", "true")
    expect(opener).toHaveProperty("inert", true)

    await user.tab()
    expect(screen.getByRole("searchbox", { name: "Search ride library" })).toHaveFocus()
    await user.tab({ shift: true })
    expect(close).toHaveFocus()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(opener).not.toHaveAttribute("aria-hidden")
    expect(opener).toHaveProperty("inert", false)
  })

  it("searches project GPX routes and loads one from its source collection", async () => {
    const user = userEvent.setup()
    const onLoadProject = vi.fn()
    render(
      <LibraryDrawer
        routes={[]}
        projectRoutes={[projectRoute]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onLoadProject={onLoadProject}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    expect(screen.getByText("Pine Ridge Ramble")).toBeVisible()
    expect(screen.getByRole("button", { name: /load pine ridge ramble/i })).toHaveTextContent("LongWay")
    await user.type(screen.getByRole("searchbox", { name: "Search ride library" }), "missing")
    expect(screen.queryByText("Pine Ridge Ramble")).not.toBeInTheDocument()
    await user.clear(screen.getByRole("searchbox", { name: "Search ride library" }))
    await user.click(screen.getByRole("button", { name: /load pine ridge ramble/i }))
    expect(onLoadProject).toHaveBeenCalledWith(projectRoute)
  })

  it("collapses duplicate project variants by region and loads the canonical original", async () => {
    const user = userEvent.setup()
    const onLoadProject = vi.fn()
    const generatedVariant: ProjectGpxRouteSummary = {
      ...projectRoute,
      id: "berks-generated",
      name: "2022 berks-county-discovery-route",
      sourceProject: "rideplanner",
      sourceFile: "rideplanner/output/gpx/berks-gaia_high_detail.gpx",
      sources: ["rideplanner/output/gpx/berks-gaia_high_detail.gpx"]
    }
    const originalVariant: ProjectGpxRouteSummary = {
      ...projectRoute,
      id: "berks-original",
      name: "2022 Berks County Discovery Route",
      sourceProject: "Roost",
      sourceFile: "Roost/roostlocker_gpx/SE_PA/2022_Berks_County_Discovery_Route.gpx",
      sources: ["Roost/roostlocker_gpx/SE_PA/2022_Berks_County_Discovery_Route.gpx"]
    }

    render(
      <LibraryDrawer
        routes={[]}
        projectRoutes={[generatedVariant, originalVariant]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onLoadProject={onLoadProject}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    expect(screen.getAllByText(/2022 berks county discovery route/i)).toHaveLength(1)
    expect(screen.getByText("Southeast PA")).toBeVisible()
    expect(screen.getByText("2 variants")).toBeVisible()
    await user.click(screen.getByRole("button", { name: /load 2022 berks county discovery route/i }))
    expect(onLoadProject).toHaveBeenCalledWith(originalVariant)

    onLoadProject.mockClear()
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Choose variant for 2022 Berks County Discovery Route" }),
      "berks-generated"
    )
    await user.click(screen.getByRole("button", { name: /load 2022 berks county discovery route/i }))
    expect(onLoadProject).toHaveBeenCalledWith(generatedVariant)
  })

  it("filters and sorts imported route groups with accessible controls", async () => {
    const user = userEvent.setup()
    const gravelRoute: ProjectGpxRouteSummary = {
      ...projectRoute,
      id: "gravel",
      name: "York Gravel Loop",
      sourceProject: "Titan",
      sourceFile: "Titan/york-gravel.gpx",
      sources: ["Titan/york-gravel.gpx"],
      distanceMiles: 42
    }
    const twistyRoute: ProjectGpxRouteSummary = {
      ...projectRoute,
      id: "twisty",
      name: "Berks Twisty Street Ride",
      sourceProject: "Roost",
      sourceFile: "Roost/roostlocker_gpx/SE_PA/berks-twisty.gpx",
      sources: ["Roost/roostlocker_gpx/SE_PA/berks-twisty.gpx"],
      distanceMiles: 180
    }

    render(
      <LibraryDrawer
        routes={[]}
        projectRoutes={[gravelRoute, twistyRoute]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onLoadProject={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by source" }), "Titan")
    expect(screen.getByText("York Gravel Loop")).toBeVisible()
    expect(screen.queryByText("Berks Twisty Street Ride")).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by source" }), "")
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by profile" }), "twisty")
    expect(screen.queryByText("York Gravel Loop")).not.toBeInTheDocument()
    expect(screen.getByText("Berks Twisty Street Ride")).toBeVisible()

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by profile" }), "")
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by surface" }), "unpaved")
    expect(screen.getByText("York Gravel Loop")).toBeVisible()
    expect(screen.queryByText("Berks Twisty Street Ride")).not.toBeInTheDocument()

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by surface" }), "")
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort imported routes" }), "distance-desc")
    expect(screen.getAllByRole("button", { name: /^Load /i }).map((button) => button.textContent)).toEqual([
      expect.stringContaining("Berks Twisty Street Ride"),
      expect.stringContaining("York Gravel Loop")
    ])
  })

  it("applies ranked sorts across regions instead of preserving region order", async () => {
    const user = userEvent.setup()
    const shortSoutheastRoute: ProjectGpxRouteSummary = {
      ...projectRoute,
      id: "short-southeast",
      name: "York County Short Loop",
      sourceProject: "Titan",
      sourceFile: "Titan/york-short.gpx",
      sources: ["Titan/york-short.gpx"],
      distanceMiles: 32
    }
    const longNortheastRoute: ProjectGpxRouteSummary = {
      ...projectRoute,
      id: "long-northeast",
      name: "Hawley Long Loop",
      sourceProject: "Roost",
      sourceFile: "Roost/roostlocker_gpx/NE_PA/hawley-long.gpx",
      sources: ["Roost/roostlocker_gpx/NE_PA/hawley-long.gpx"],
      distanceMiles: 180
    }

    render(
      <LibraryDrawer
        routes={[]}
        projectRoutes={[shortSoutheastRoute, longNortheastRoute]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onLoadProject={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    await user.selectOptions(screen.getByRole("combobox", { name: "Sort imported routes" }), "distance-desc")

    expect(screen.getAllByRole("button", { name: /^Load /i }).map((button) => button.textContent)).toEqual([
      expect.stringContaining("Hawley Long Loop"),
      expect.stringContaining("York County Short Loop")
    ])
  })

  it("describes an empty facet result as no matching rides", async () => {
    const user = userEvent.setup()
    const gravelRoute: ProjectGpxRouteSummary = {
      ...projectRoute,
      id: "gravel-only",
      name: "York Gravel Loop",
      sourceProject: "Titan",
      sourceFile: "Titan/york-gravel.gpx",
      sources: ["Titan/york-gravel.gpx"]
    }
    const twistyRoute: ProjectGpxRouteSummary = {
      ...projectRoute,
      id: "twisty-only",
      name: "Berks Twisty Street Ride",
      sourceProject: "Roost",
      sourceFile: "Roost/SE_PA/berks-twisty.gpx",
      sources: ["Roost/SE_PA/berks-twisty.gpx"]
    }

    render(
      <LibraryDrawer
        routes={[]}
        projectRoutes={[gravelRoute, twistyRoute]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onLoadProject={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by source" }), "Titan")
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by profile" }), "twisty")

    expect(screen.getByText("No matching rides")).toBeVisible()
    const sort = screen.getByRole("combobox", { name: "Sort imported routes" })
    sort.focus()
    await user.tab()
    expect(screen.getByLabelText("Import GPX, KML, or KMZ file")).toHaveFocus()
    await user.tab({ shift: true })
    expect(sort).toHaveFocus()
  })

  it("imports an accessible file input and requires confirmation before deleting", async () => {
    const user = userEvent.setup()
    const onImport = vi.fn()
    const onDelete = vi.fn()

    render(
      <LibraryDrawer
        routes={[savedRoute]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={onDelete}
        onImport={onImport}
      />
    )

    const file = new File(["<gpx />"], "loop.gpx", { type: "application/gpx+xml" })
    await user.upload(screen.getByLabelText("Import GPX, KML, or KMZ file"), file)
    expect(onImport).toHaveBeenCalledWith(file)

    await user.click(screen.getByRole("button", { name: "Delete Sunday loop" }))
    expect(onDelete).not.toHaveBeenCalled()
    const confirm = screen.getByRole("button", { name: "Confirm delete Sunday loop" })
    expect(confirm).toHaveAttribute("aria-pressed", "true")

    await user.click(confirm)
    expect(onDelete).toHaveBeenCalledWith(savedRoute)
  })
})
