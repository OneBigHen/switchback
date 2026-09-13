import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AppNavigation } from "@/components/shell/AppNavigation"
import { destinationFromLocation, type PrimaryDestination } from "@/lib/client/app-navigation"

function renderNav(activeDestination: PrimaryDestination = "plan") {
  const onSelect = vi.fn()
  const onOpenRecord = vi.fn()
  render(
    <AppNavigation
      activeDestination={activeDestination}
      onSelect={onSelect}
      onOpenRecord={onOpenRecord}
    />
  )
  return { onSelect, onOpenRecord }
}

describe("AppNavigation", () => {
  beforeEach(() => {
    cleanup()
  })

  it("renders the approved OpenGravel shell identity", () => {
    renderNav()

    expect(screen.getByText("OpenGravel")).toBeInTheDocument()
    expect(screen.queryByText("Switchback")).not.toBeInTheDocument()
    expect(screen.getByText("Gravel & backroad routing")).toBeInTheDocument()
  })

  it("exposes the approved mobile model in order", () => {
    renderNav()

    const primary = screen.getByRole("group", { name: "Primary destinations" })
    const items = within(primary).getAllByRole("button")

    expect(items.map((item) => item.textContent)).toEqual([
      "Plan",
      "Explore",
      "Saved",
      "Settings",
      "Record"
    ])
  })

  it("announces the active destination", () => {
    renderNav("saved")

    const primary = screen.getByRole("group", { name: "Primary destinations" })
    const saved = within(primary).getByRole("button", { name: "Saved" })

    expect(saved).toHaveAttribute("aria-current", "page")
    expect(within(primary).getByRole("button", { name: "Plan" })).not.toHaveAttribute("aria-current")
  })

  it("selects destinations through the primary cluster", () => {
    const { onSelect } = renderNav()

    fireEvent.click(screen.getByRole("button", { name: "Explore" }))

    expect(onSelect).toHaveBeenCalledWith("explore")
  })

  it("routes discovery to Explore and rider-owned material to Saved", () => {
    const { onSelect } = renderNav()

    fireEvent.click(screen.getByRole("button", { name: "Saved" }))

    expect(onSelect).toHaveBeenCalledWith("saved")
    expect(screen.queryByRole("button", { name: "Rides" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Discover" })).not.toBeInTheDocument()
  })

  it("selects Settings as a destination rather than a secondary launcher", () => {
    const { onSelect } = renderNav()

    const primary = screen.getByRole("group", { name: "Primary destinations" })
    fireEvent.click(within(primary).getByRole("button", { name: "Settings" }))

    expect(onSelect).toHaveBeenCalledWith("settings")
    expect(within(screen.getByRole("navigation", { name: "Primary" })).queryByRole("button", { name: /open settings/i })).not.toBeInTheDocument()
  })

  it("offers record as an activity control, not a destination", () => {
    const { onOpenRecord } = renderNav()

    fireEvent.click(screen.getByRole("button", { name: "Record" }))

    expect(onOpenRecord).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "Record" }).closest("[data-nav-cluster]")).toHaveAttribute(
      "data-nav-cluster",
      "secondary"
    )
    // Sharing the bar must not make Record claim to be a place.
    expect(screen.getByRole("button", { name: "Record" })).not.toHaveAttribute("aria-current")
  })

  it("migrates legacy profile deep links to the Settings destination", () => {
    expect(destinationFromLocation("https://switchback.test/?tab=profile")).toEqual({
      destination: "settings",
      overlays: []
    })
  })
})
