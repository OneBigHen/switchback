import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AppNavigation } from "@/components/shell/AppNavigation"
import { destinationFromLocation, type PrimaryDestination } from "@/lib/client/app-navigation"

function renderNav(activeDestination: PrimaryDestination = "plan") {
  const onSelect = vi.fn()
  const onOpenRecord = vi.fn()
  const onOpenSettings = vi.fn()
  render(
    <AppNavigation
      activeDestination={activeDestination}
      onSelect={onSelect}
      onOpenRecord={onOpenRecord}
      onOpenSettings={onOpenSettings}
    />
  )
  return { onSelect, onOpenRecord, onOpenSettings }
}

describe("AppNavigation", () => {
  beforeEach(() => {
    cleanup()
  })

  it("exposes the four V2 destinations in the primary cluster", () => {
    renderNav()

    const primary = screen.getByRole("group", { name: "Primary destinations" })
    const items = within(primary).getAllByRole("button")

    expect(items.map((item) => item.textContent)).toEqual(["Plan", "Rides", "Discover", "Settings"])
  })

  it("announces the active destination", () => {
    renderNav("rides")

    const primary = screen.getByRole("group", { name: "Primary destinations" })
    const rides = within(primary).getByRole("button", { name: "Rides" })

    expect(rides).toHaveAttribute("aria-current", "page")
    expect(within(primary).getByRole("button", { name: "Plan" })).not.toHaveAttribute("aria-current")
  })

  it("selects destinations through the primary cluster", () => {
    const { onSelect } = renderNav()

    fireEvent.click(screen.getByRole("button", { name: "Discover" }))

    expect(onSelect).toHaveBeenCalledWith("discover")
  })

  it("selects Settings as a destination rather than opening an overlay", () => {
    const { onSelect, onOpenSettings } = renderNav()

    const primary = screen.getByRole("group", { name: "Primary destinations" })
    fireEvent.click(within(primary).getByRole("button", { name: "Settings" }))

    expect(onSelect).toHaveBeenCalledWith("settings")
    expect(onOpenSettings).not.toHaveBeenCalled()
  })

  it("offers record as an activity control, not a destination", () => {
    const { onOpenRecord } = renderNav()

    fireEvent.click(screen.getByRole("button", { name: "Record" }))

    expect(onOpenRecord).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "Record" }).closest("[data-nav-cluster]")).toHaveAttribute(
      "data-nav-cluster",
      "secondary"
    )
  })

  it("migrates legacy profile deep links to the Settings destination", () => {
    expect(destinationFromLocation("https://switchback.test/?tab=profile")).toEqual({
      destination: "settings",
      overlays: []
    })
  })
})
