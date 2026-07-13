import { useState } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LibraryDrawer } from "@/components/planner/LibraryDrawer"
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
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z"
}

afterEach(cleanup)

describe("ride library drawer", () => {
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
    const importer = screen.getByLabelText("Import GPX file")
    expect(close).toHaveFocus()
    expect(opener).toHaveAttribute("aria-hidden", "true")
    expect(opener).toHaveProperty("inert", true)

    await user.tab()
    expect(importer).toHaveFocus()
    await user.tab({ shift: true })
    expect(close).toHaveFocus()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    expect(opener).not.toHaveAttribute("aria-hidden")
    expect(opener).toHaveProperty("inert", false)
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
    await user.upload(screen.getByLabelText("Import GPX file"), file)
    expect(onImport).toHaveBeenCalledWith(file)

    await user.click(screen.getByRole("button", { name: "Delete Sunday loop" }))
    expect(onDelete).not.toHaveBeenCalled()
    const confirm = screen.getByRole("button", { name: "Confirm delete Sunday loop" })
    expect(confirm).toHaveAttribute("aria-pressed", "true")

    await user.click(confirm)
    expect(onDelete).toHaveBeenCalledWith(savedRoute)
  })
})
