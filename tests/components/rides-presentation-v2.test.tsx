import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RidesSurface, type RideLibraryItem } from "@/components/rides/RidesSurface"

const items: RideLibraryItem[] = [
  { id: "saved:1", sourceId: "1", kind: "saved-route", name: "Ridge Run", sourceLabel: "Saved route", distanceMiles: 82.4, durationMinutes: 128, durationSource: "planned", updatedAt: "2026-08-30T12:00:00Z", tags: ["weekend"] },
  { id: "recorded:2", sourceId: "2", kind: "recorded-ride", name: "Pine Barrens", sourceLabel: "Recorded ride", distanceMiles: 61.2, durationMinutes: 104, durationSource: "planned", updatedAt: "2026-08-29T12:00:00Z", tags: [] },
  { id: "trip:3", sourceId: "3", kind: "trip-plan", name: "Allegheny Weekend", sourceLabel: "Trip plan · 2 days", distanceMiles: 301, durationMinutes: 470, durationSource: "planned", updatedAt: "2026-08-28T12:00:00Z", tags: [] },
  { id: "saved:4", sourceId: "4", kind: "saved-route", name: "Bald Eagle Track", sourceLabel: "Imported GPX", distanceMiles: 48, durationMinutes: 92, durationSource: "planned", updatedAt: "2026-08-27T12:00:00Z", tags: ["high confidence"], management: { imported: true, canMatchRoads: true } }
]

afterEach(cleanup)

describe("Rides V2 presentation", () => {
  it("shows personal source counts in accessible filter controls and one route identity graphic per row", () => {
    const { container } = render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByRole("button", { name: /All 4/i })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: /Planned 1/i })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: /Recorded 1/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Trips 1/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Imported 1/i })).toBeInTheDocument()
    // Every row still carries a visual identity — but it is the ride's own
    // shape, or an honest "unavailable" glyph, never a generated one. These
    // fixtures carry no geometry, so all four rows say so.
    expect(container.querySelectorAll("[data-route-thumbnail]").length).toBe(4)
    expect(container.querySelectorAll('[data-route-thumbnail="unavailable"]').length).toBe(4)
    // The remaining decorative graphic is the destination header, which is not
    // claiming to be any particular ride.
    expect(container.querySelectorAll('[data-route-graphic="route"]').length).toBe(0)
  })

  it("keeps the import action and object-first ride names prominent", () => {
    render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)
    expect(screen.getByRole("button", { name: /Import ride/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Open Ridge Run/i })).toBeInTheDocument()
  })

  it("labels a saved route imported from GPX with the same Imported identity used by counts and filters", () => {
    const imported: RideLibraryItem = {
      id: "saved:gpx",
      sourceId: "gpx",
      kind: "saved-route",
      name: "Luna PA NJ Synthetic Test",
      sourceLabel: "Imported GPX",
      distanceMiles: 35.9,
      durationMinutes: 0,
      durationSource: "planned",
      updatedAt: "2026-09-09T12:00:00Z",
      tags: [],
      management: { imported: true, canMatchRoads: true, canDelete: true }
    }

    render(<RidesSurface items={[imported]} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByRole("button", { name: /Planned 0/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Imported 1/i })).toBeInTheDocument()
    const row = screen.getByRole("button", { name: /Open Luna PA NJ Synthetic Test/i })
    expect(within(row).getByText("Imported")).toBeInTheDocument()
    expect(within(row).queryByText("Planned")).not.toBeInTheDocument()
  })

  it("keeps rider-owned import identity aligned across cards, filters, and counts", () => {
    const importedItems: RideLibraryItem[] = [
      { ...items[0], id: "saved:import-1", name: "GPX identity", management: { imported: true } },
      { ...items[0], id: "saved:import-2", name: "KML identity", management: { imported: true } },
      { ...items[0], id: "saved:import-3", name: "KMZ identity", management: { imported: true } },
      { ...items[0], id: "saved:planned", name: "Planned identity" },
      { ...items[0], id: "saved:explicit-false", name: "Explicit false identity", management: { imported: false } }
    ]

    render(<RidesSurface items={importedItems} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByRole("button", { name: "All 5" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Imported 3" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Planned 2" })).toBeInTheDocument()

    for (const name of ["GPX identity", "KML identity", "KMZ identity"]) {
      const row = screen.getByRole("button", { name: `Open ${name}` })
      expect(within(row).getByText("Imported", { exact: true })).toBeInTheDocument()
    }
    for (const name of ["Planned identity", "Explicit false identity"]) {
      const row = screen.getByRole("button", { name: `Open ${name}` })
      expect(within(row).getByText("Planned", { exact: true })).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole("button", { name: "Imported 3" }))
    expect(screen.getByRole("button", { name: "Open GPX identity" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open KML identity" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open KMZ identity" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Planned identity" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Explicit false identity" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Planned 2" }))
    expect(screen.getByRole("button", { name: "Open Planned identity" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Explicit false identity" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open GPX identity" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open KML identity" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open KMZ identity" })).not.toBeInTheDocument()
  })
})
