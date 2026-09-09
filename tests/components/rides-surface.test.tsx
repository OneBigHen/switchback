import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RidesSurface, type RideLibraryItem } from "@/components/rides/RidesSurface"

afterEach(cleanup)

const items: RideLibraryItem[] = [
  {
    id: "saved-1",
    kind: "saved-route",
    name: "Pine Creek back roads",
    sourceLabel: "Saved route",
    distanceMiles: 82.4,
    durationMinutes: 146, durationSource: "planned",
    updatedAt: "2026-08-28T12:00:00Z",
    tags: ["weekend"]
  },
  {
    id: "recorded-1",
    kind: "recorded-ride",
    name: "Sunday ride",
    sourceLabel: "Recorded ride",
    distanceMiles: 63.1,
    durationMinutes: 118, durationSource: "planned",
    updatedAt: "2026-08-30T12:00:00Z",
    tags: []
  },
  {
    id: "project-1",
    kind: "project-gpx",
    name: "Bald Eagle Dual Sport Loop",
    sourceLabel: "Project GPX · rideplanner",
    distanceMiles: 104.7,
    durationMinutes: 0, durationSource: "planned",
    updatedAt: null,
    summary: "A solid half-day run that stays nicely twisty start to finish.",
    macroRegion: "North-Central PA",
    ridingAreas: ["Bald Eagle / Rothrock"],
    preview: {
      paths: ["M8 110 L35 60 L76 82 L92 12"],
      start: [8, 110],
      end: [92, 12]
    },
    tags: []
  },
  {
    id: "project-2",
    kind: "project-gpx",
    name: "Pocono Ridge Loop",
    sourceLabel: "Project GPX · library",
    distanceMiles: 74.2,
    durationMinutes: 132, durationSource: "planned",
    updatedAt: null,
    summary: "A flowing ridge loop in the northeast.",
    macroRegion: "Northeast PA",
    ridingAreas: ["Poconos"],
    tags: []
  }
]

describe("RidesSurface", () => {
  it("renders Rides as a destination section instead of a closable modal", () => {
    render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByRole("region", { name: "Rides" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Rides" })).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "Search rides" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Ride types" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import ride" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument()
  })

  it("filters across normalized ride sources without changing their storage identity", () => {
    render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Recorded 1" }))
    expect(screen.getByText("Sunday ride")).toBeInTheDocument()
    expect(screen.queryByText("Pine Creek back roads")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "All 4" }))
    fireEvent.change(screen.getByRole("searchbox", { name: "Search rides" }), { target: { value: "Rothrock" } })
    expect(screen.getByText("Bald Eagle Dual Sport Loop")).toBeInTheDocument()
    expect(screen.queryByText("Sunday ride")).not.toBeInTheDocument()
  })

  it("keeps an imported saved GPX in Imported and out of Planned", () => {
    const importedSaved: RideLibraryItem = {
      id: "saved-imported-1",
      kind: "saved-route",
      name: "Imported Allegheny track",
      sourceLabel: "Saved route",
      distanceMiles: 58.2,
      durationMinutes: 122, durationSource: "planned",
      updatedAt: "2026-09-01T12:00:00Z",
      tags: [],
      management: { imported: true, canMatchRoads: true }
    }
    render(<RidesSurface items={[...items, importedSaved]} onOpen={vi.fn()} onImport={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Imported 3" }))
    expect(screen.getByText("Imported Allegheny track")).toBeInTheDocument()
    expect(screen.getByText("Bald Eagle Dual Sport Loop")).toBeInTheDocument()
    expect(screen.getByText("Pocono Ridge Loop")).toBeInTheDocument()
    expect(screen.queryByText("Pine Creek back roads")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Planned 1" }))
    expect(screen.getByText("Pine Creek back roads")).toBeInTheDocument()
    expect(screen.queryByText("Imported Allegheny track")).not.toBeInTheDocument()
  })

  it("lets riders narrow imported routes by broad PA region and recognizable riding area", () => {
    render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)

    fireEvent.change(screen.getByRole("combobox", { name: "Browse region" }), { target: { value: "North-Central PA" } })
    expect(screen.getByText("Bald Eagle Dual Sport Loop")).toBeInTheDocument()
    expect(screen.queryByText("Pocono Ridge Loop")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Bald Eagle / Rothrock" }))
    expect(screen.getByText("Bald Eagle Dual Sport Loop")).toBeInTheDocument()
  })

  it("shows the grounded summary and never prints zero minutes for an unknown imported duration", () => {
    render(<RidesSurface items={[items[2]!]} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByText("A solid half-day run that stays nicely twisty start to finish.")).toBeInTheDocument()
    expect(screen.queryByText("0 min")).not.toBeInTheDocument()
    expect(screen.getByTestId("route-preview-ready")).toBeInTheDocument()
  })

  it("opens the exact normalized item selected by the rider", () => {
    const onOpen = vi.fn()
    render(<RidesSurface items={items} onOpen={onOpen} onImport={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /Open Pine Creek back roads/i }))
    expect(onOpen).toHaveBeenCalledWith(items[0])
  })
})
