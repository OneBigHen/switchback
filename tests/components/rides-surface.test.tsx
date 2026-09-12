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
    durationMinutes: 146,
    durationSource: "planned",
    updatedAt: "2026-08-28T12:00:00Z",
    tags: ["weekend"]
  },
  {
    id: "recorded-1",
    kind: "recorded-ride",
    name: "Sunday ride",
    sourceLabel: "Recorded ride",
    distanceMiles: 63.1,
    durationMinutes: 118,
    durationSource: "planned",
    updatedAt: "2026-08-30T12:00:00Z",
    tags: []
  },
  {
    id: "saved-imported-1",
    kind: "saved-route",
    name: "Imported Allegheny track",
    sourceLabel: "Imported GPX",
    distanceMiles: 58.2,
    durationMinutes: 122,
    durationSource: "planned",
    updatedAt: "2026-09-01T12:00:00Z",
    tags: [],
    management: { imported: true, canMatchRoads: true }
  }
]

describe("RidesSurface", () => {
  it("renders My Rides as a personal destination instead of a shared catalog", () => {
    render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByRole("region", { name: "My Rides" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "My Rides" })).toBeInTheDocument()
    expect(screen.getByText(/files you saved/i)).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: "Search rides" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Ride types" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import ride" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument()
  })

  it("points riders to the shared Route Library without mixing its routes into My Rides", () => {
    render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByRole("link", { name: "Browse Route Library" })).toHaveAttribute("href", "/gpx-library")
  })

  it("offers the Route Library from the empty personal state", () => {
    render(<RidesSurface items={[]} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByText("No rides saved yet.")).toBeInTheDocument()
    expect(screen.getByText(/save one from the Route Library/i)).toBeInTheDocument()
  })

  it("never shows an unknown saved-route duration as 0 min or labels rows as a project library", () => {
    const unknownDuration: RideLibraryItem = {
      id: "catalog-copy--atlas-42",
      kind: "saved-route",
      name: "Bald Eagle Loop",
      sourceLabel: "Saved route",
      distanceMiles: 104.7,
      durationMinutes: 0,
      durationSource: "planned",
      updatedAt: null,
      tags: []
    }
    render(<RidesSurface items={[unknownDuration]} onOpen={vi.fn()} onImport={vi.fn()} />)

    const row = screen.getByText("Bald Eagle Loop").closest("li") ?? document.body
    expect(row).toHaveTextContent("104.7 mi")
    expect(row).not.toHaveTextContent(/\b0 min\b/)
    expect(screen.queryByText("Project library")).toBeNull()
  })

  it("filters only rider-owned normalized sources without changing storage identity", () => {
    render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Recorded 1" }))
    expect(screen.getByText("Sunday ride")).toBeInTheDocument()
    expect(screen.queryByText("Pine Creek back roads")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "All 3" }))
    fireEvent.change(screen.getByRole("searchbox", { name: "Search rides" }), { target: { value: "Allegheny" } })
    expect(screen.getByText("Imported Allegheny track")).toBeInTheDocument()
    expect(screen.queryByText("Sunday ride")).not.toBeInTheDocument()
  })

  it("keeps a personal imported file in Imported and out of Planned", () => {
    render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "Imported 1" }))
    expect(screen.getByText("Imported Allegheny track")).toBeInTheDocument()
    expect(screen.queryByText("Pine Creek back roads")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Planned 1" }))
    expect(screen.getByText("Pine Creek back roads")).toBeInTheDocument()
    expect(screen.queryByText("Imported Allegheny track")).not.toBeInTheDocument()
  })

  it("opens the exact normalized personal item selected by the rider", () => {
    const onOpen = vi.fn()
    render(<RidesSurface items={items} onOpen={onOpen} onImport={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /Open Pine Creek back roads/i }))
    expect(onOpen).toHaveBeenCalledWith(items[0])
  })
})
