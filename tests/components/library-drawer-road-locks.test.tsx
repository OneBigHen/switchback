import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LibraryDrawer } from "@/components/planner/LibraryDrawer"
import { usePlannerStore } from "@/stores/planner-store"
import type { SavedRoute } from "@/lib/storage/route-library"

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

afterEach(() => {
  cleanup()
  usePlannerStore.getState().clearRoadLocks()
})

describe("LibraryDrawer Import as lock affordance", () => {
  it("renders the Import as lock button next to Import route", () => {
    render(
      <LibraryDrawer
        routes={[]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )
    expect(screen.getByRole("button", { name: "Import as road lock" })).toBeInTheDocument()
    expect(screen.getByLabelText("Import GPX, KML, or KMZ file")).toBeInTheDocument()
  })

  it("opens the inline mode picker after a GPX file is chosen", () => {
    render(
      <LibraryDrawer
        routes={[savedRoute]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )
    const file = new File(["<gpx />"], "lock.gpx", { type: "application/gpx+xml" })
    fireEvent.change(screen.getByLabelText("Import a GPX, KML, or KMZ file as a road lock"), { target: { files: [file] } })
    expect(screen.getByText("Import as road lock")).toBeInTheDocument()
    expect(screen.getByText("lock.gpx")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /Must use/i })).toBeChecked()
    expect(screen.getByRole("radio", { name: /Prefer/i })).not.toBeChecked()
    expect(screen.getByRole("button", { name: /Save road lock/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument()
  })

  it("refuses a third mode beyond Must use/Prefer", () => {
    render(
      <LibraryDrawer
        routes={[]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
      />
    )
    const file = new File(["<gpx />"], "lock.gpx", { type: "application/gpx+xml" })
    fireEvent.change(screen.getByLabelText("Import a GPX, KML, or KMZ file as a road lock"), { target: { files: [file] } })
    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(2)
    const values = radios.map((radio) => (radio as HTMLInputElement).value).sort()
    expect(values).toEqual(["must", "prefer"])
  })

  it("persists the resulting lock via the planner-store when onImportAsLock is provided", async () => {
    const onImportAsLock = vi.fn().mockResolvedValue({
      id: "lock-from-store",
      mode: "prefer",
      displayName: "Imported ridge",
      confidence: "matched",
      source: "gpx",
      edgeIds: [],
      geometry: { type: "LineString", coordinates: [[-77, 40], [-76.8, 40.1]] },
      orderedAnchors: [[-77, 40], [-76.8, 40.1]],
      fallbackToleranceMeters: 50,
      sourceRegionId: "gpx-import",
      sourceGraphVersion: "gpx-import",
      accessSnapshot: {
        highwayClass: "unknown",
        motorcycleAccess: "unknown",
        generalAccess: "unknown",
        surface: "unknown",
        smoothness: "unknown",
        tracktype: "unknown",
        maxweightTonnes: null,
        seasonalUndated: false,
        activeConditions: [],
        routable: true
      },
      createdAt: "2025-01-01T00:00:00.000Z"
    })

    render(
      <LibraryDrawer
        routes={[]}
        onClose={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        onImport={vi.fn()}
        onImportAsLock={onImportAsLock}
      />
    )

    const file = new File(["<gpx />"], "ridge.gpx", { type: "application/gpx+xml" })
    fireEvent.change(screen.getByLabelText("Import a GPX, KML, or KMZ file as a road lock"), { target: { files: [file] } })
    const preferRadio = screen.getByRole("radio", { name: /Prefer/i })
    fireEvent.click(preferRadio)
    fireEvent.change(screen.getByPlaceholderText("Best section of PA-125"), { target: { value: "Ridge crest" } })
    fireEvent.click(screen.getByRole("button", { name: /Save road lock/i }))

    await vi.waitFor(() => {
      expect(onImportAsLock).toHaveBeenCalledTimes(1)
    })
    expect(onImportAsLock.mock.calls[0]![0]).toBe(file)
    const options = onImportAsLock.mock.calls[0]![1]
    expect(options.mode).toBe("prefer")
    expect(options.displayName).toBe("Ridge crest")
    await vi.waitFor(() => {
      const locks = usePlannerStore.getState().roadLocks
      expect(locks.some((lock) => lock.id === "lock-from-store")).toBe(true)
    })
  })
})
