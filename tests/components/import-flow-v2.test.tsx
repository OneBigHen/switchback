import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ImportFlow } from "@/components/rides/ImportFlow"

describe("ImportFlow", () => {
  it("offers route, prefer-road, and require-road meanings after a file is chosen", () => {
    const onImportRoute = vi.fn()
    const onImportRoads = vi.fn()
    render(<ImportFlow onImportRoute={onImportRoute} onImportRoads={onImportRoads} />)

    const file = new File(["<gpx />"], "weekend.gpx", { type: "application/gpx+xml" })
    fireEvent.change(screen.getByLabelText("Choose GPX, KML, or KMZ file"), { target: { files: [file] } })

    expect(screen.getByText("weekend.gpx")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open as a route" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Prefer these roads" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Require these roads" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Prefer these roads" }))
    expect(onImportRoads).toHaveBeenCalledWith(file, "prefer")
  })

  it("maps Require these roads to the existing must-use lock mode", () => {
    const onImportRoads = vi.fn()
    render(<ImportFlow onImportRoute={vi.fn()} onImportRoads={onImportRoads} />)

    const file = new File(["<gpx />"], "must-use.gpx", { type: "application/gpx+xml" })
    fireEvent.change(screen.getByLabelText("Choose GPX, KML, or KMZ file"), { target: { files: [file] } })
    fireEvent.click(screen.getByRole("button", { name: "Require these roads" }))

    expect(onImportRoads).toHaveBeenCalledWith(file, "must")
  })
})
