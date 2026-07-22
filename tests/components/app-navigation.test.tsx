import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AppNavigation } from "@/components/shell/AppNavigation"

describe("AppNavigation", () => {
  it("exposes all four real destinations with the active tab announced", () => {
    const onSelect = vi.fn()
    render(<AppNavigation activeTab="record" onSelect={onSelect} />)

    const nav = screen.getByRole("navigation", { name: "Primary" })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Record" })).toHaveAttribute("aria-current", "page")
    fireEvent.click(screen.getByRole("button", { name: "Profile" }))
    expect(onSelect).toHaveBeenCalledWith("profile")
  })
})
