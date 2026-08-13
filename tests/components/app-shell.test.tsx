import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AppShell } from "@/components/shell/AppShell"

describe("AppShell", () => {
  it("exposes the high-level mode without remounting its map/content slot", () => {
    const { rerender } = render(
      <AppShell mode="explore"><span>persistent map</span></AppShell>
    )

    expect(screen.getByRole("main")).toHaveAttribute("data-app-mode", "explore")
    expect(screen.getByRole("main")).toHaveAttribute("data-map-shell", "true")
    expect(screen.getByText("persistent map")).toBeInTheDocument()

    rerender(<AppShell mode="ride"><span>persistent map</span></AppShell>)
    expect(screen.getByRole("main")).toHaveAttribute("data-app-mode", "ride")
    expect(screen.getByText("persistent map")).toBeInTheDocument()
  })
})
