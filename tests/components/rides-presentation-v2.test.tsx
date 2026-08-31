import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RidesSurface, type RideLibraryItem } from "@/components/rides/RidesSurface"

const items: RideLibraryItem[] = [
  { id: "saved:1", sourceId: "1", kind: "saved-route", name: "Ridge Run", sourceLabel: "Saved route", distanceMiles: 82.4, durationMinutes: 128, updatedAt: "2026-08-30T12:00:00Z", tags: ["weekend"] },
  { id: "recorded:2", sourceId: "2", kind: "recorded-ride", name: "Pine Barrens", sourceLabel: "Recorded ride", distanceMiles: 61.2, durationMinutes: 104, updatedAt: "2026-08-29T12:00:00Z", tags: [] },
  { id: "trip:3", sourceId: "3", kind: "trip-plan", name: "Allegheny Weekend", sourceLabel: "Trip plan · 2 days", distanceMiles: 301, durationMinutes: 470, updatedAt: "2026-08-28T12:00:00Z", tags: [] },
  { id: "project:4", sourceId: "4", kind: "project-gpx", name: "Bald Eagle Track", sourceLabel: "Project GPX · ADV", distanceMiles: 48, durationMinutes: 92, updatedAt: null, tags: ["high confidence"] }
]

afterEach(cleanup)

describe("Rides V2 presentation", () => {
  it("shows source counts in accessible filter controls and generated route identity graphics", () => {
    const { container } = render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByRole("button", { name: /All 4/i })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: /Planned 1/i })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: /Recorded 1/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Trips 1/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Imported 1/i })).toBeInTheDocument()
    expect(container.querySelectorAll("[data-route-graphic]").length).toBeGreaterThanOrEqual(5)
  })

  it("keeps the import action and object-first ride names prominent", () => {
    render(<RidesSurface items={items} onOpen={vi.fn()} onImport={vi.fn()} />)
    expect(screen.getByRole("button", { name: /Import ride/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Open Ridge Run/i })).toBeInTheDocument()
  })
})
