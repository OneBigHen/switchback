import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
  folder: "Weekend",
  tags: ["ridge"],
  visible: true,
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z"
}

const savedTrip: TripPlan = {
  version: 2,
  id: "trip-long-ridge",
  routeId: savedRoute.id,
  name: "Long Ridge Weekend",
  route: savedRoute,
  constraints: {
    targetDayMinutes: 300,
    fuelRangeMiles: 140,
    fuelReserveMiles: 25,
    breakEveryMinutes: 90,
    daylightMinutes: 270
  },
  stages: [],
  warnings: [],
  createdAt: "2026-07-18T12:00:00.000Z",
  updatedAt: "2026-07-18T12:00:00.000Z"
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

afterEach(cleanup)

describe("LibraryDrawer V2 compatibility", () => {
  it("renders the Rides destination instead of a modal drawer and loads saved routes", () => {
    const onLoad = vi.fn()
    render(
      <LibraryDrawer
        routes={[savedRoute]}
        onClose={vi.fn()}
        onLoad={onLoad}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    expect(screen.getByRole("main", { name: "Rides destination" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Sunday loop" }))
    expect(onLoad).toHaveBeenCalledWith(savedRoute)
  })

  it("searches the unified V2 library and opens project GPX items", () => {
    const onLoadProject = vi.fn()
    render(
      <LibraryDrawer
        routes={[savedRoute]}
        projectRoutes={[projectRoute]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onLoadProject={onLoadProject}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    const search = screen.getByRole("searchbox", { name: "Search rides" })
    fireEvent.change(search, { target: { value: "Pine Ridge" } })
    expect(screen.queryByRole("button", { name: "Open Sunday loop" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Pine Ridge Ramble" }))
    expect(onLoadProject).toHaveBeenCalledWith(projectRoute)
  })

  it("keeps trip deletion contextual and requires confirmation", async () => {
    const onDeleteTrip = vi.fn()
    render(
      <LibraryDrawer
        routes={[]}
        trips={[savedTrip]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onLoadTrip={vi.fn()}
        onDeleteTrip={onDeleteTrip}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Manage Long Ridge Weekend" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete trip" }))
    expect(onDeleteTrip).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete trip" }))
    await waitFor(() => expect(onDeleteTrip).toHaveBeenCalledWith(savedTrip))
  })
})
