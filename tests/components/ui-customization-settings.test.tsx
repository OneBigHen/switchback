import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UiCustomizationSettings } from "@/components/settings/UiCustomizationSettings"
import { defaultRiderUiPreferences } from "@/lib/settings/rider-settings"

afterEach(cleanup)

describe("UiCustomizationSettings", () => {
  it("exposes only the curated customization groups and a reset action", () => {
    render(<UiCustomizationSettings value={defaultRiderUiPreferences()} onChange={vi.fn()} />)

    expect(screen.getByRole("heading", { name: "Customize" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Plan quick actions" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Quick layers" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Ride HUD metrics" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Recording metrics" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Route details" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reset to Switchback defaults" })).toBeInTheDocument()
    expect(screen.queryByText(/position x|position y|grid/i)).not.toBeInTheDocument()
  })

  it("reorders a bounded list without mutating the original preference object", () => {
    const value = defaultRiderUiPreferences()
    const original = structuredClone(value)
    const onChange = vi.fn()
    render(<UiCustomizationSettings value={value} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Move Record earlier" }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      planQuickActions: ["record", "free-ride"]
    }))
    expect(value).toEqual(original)
  })

  it("does not allow required route-detail modules to be hidden", () => {
    render(<UiCustomizationSettings value={defaultRiderUiPreferences()} onChange={vi.fn()} />)

    expect(screen.getByRole("checkbox", { name: "Show Overview" })).toBeDisabled()
    expect(screen.getByRole("checkbox", { name: "Show Start & actions" })).toBeDisabled()
    expect(screen.getByRole("checkbox", { name: "Show Weather & alerts" })).toBeEnabled()
  })
})
