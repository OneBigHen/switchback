import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LibraryDrawer } from "@/components/planner/LibraryDrawer"

afterEach(cleanup)

function renderLibrary(onImportAsLock = vi.fn().mockResolvedValue(null), onImport = vi.fn()) {
  render(
    <LibraryDrawer
      routes={[]}
      onClose={vi.fn()}
      onLoad={vi.fn()}
      onDelete={vi.fn()}
      onImport={onImport}
      onImportAsLock={onImportAsLock}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: "Import ride" }))
  return { onImportAsLock, onImport }
}

function chooseFile(name = "ridge-road.gpx") {
  const file = new File(["<gpx />"], name, { type: "application/gpx+xml" })
  fireEvent.change(screen.getByLabelText("Choose GPX, KML, or KMZ file"), { target: { files: [file] } })
  return file
}

describe("Rides V2 road-lock import", () => {
  it("offers route, Prefer and Require choices from the single import flow", () => {
    renderLibrary()
    chooseFile()

    expect(screen.getByRole("button", { name: /Open as a route/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Prefer these roads/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Require these roads/i })).toBeInTheDocument()
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
  })

  it("imports a preferred corridor with a filename-derived display name", async () => {
    const onImportAsLock = vi.fn().mockResolvedValue(null)
    renderLibrary(onImportAsLock)
    const file = chooseFile("Ridge Crest.gpx")

    fireEvent.click(screen.getByRole("button", { name: /Prefer these roads/i }))
    await waitFor(() => expect(onImportAsLock).toHaveBeenCalledTimes(1))
    expect(onImportAsLock).toHaveBeenCalledWith(file, {
      mode: "prefer",
      displayName: "Ridge Crest"
    })
  })

  it("imports a required corridor without inventing a third road-lock mode", async () => {
    const onImportAsLock = vi.fn().mockResolvedValue(null)
    renderLibrary(onImportAsLock)
    const file = chooseFile("must-use.kml")

    fireEvent.click(screen.getByRole("button", { name: /Require these roads/i }))
    await waitFor(() => expect(onImportAsLock).toHaveBeenCalledTimes(1))
    expect(onImportAsLock).toHaveBeenCalledWith(file, {
      mode: "must",
      displayName: "must-use"
    })
  })

  it("keeps normal route import available from the same selected file", () => {
    const onImport = vi.fn()
    renderLibrary(vi.fn().mockResolvedValue(null), onImport)
    const file = chooseFile("weekend.kmz")

    fireEvent.click(screen.getByRole("button", { name: /Open as a route/i }))
    expect(onImport).toHaveBeenCalledWith(file)
  })
})
