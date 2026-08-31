import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SettingsDestination } from "@/components/settings/SettingsDestination"
import { createDefaultBike, createDefaultSettings, loadRiderSettings, saveRiderSettings } from "@/lib/settings/rider-settings"

afterEach(cleanup)

beforeEach(() => {
  localStorage.clear()
  const settings = createDefaultSettings()
  settings.riderName = "Zac"
  settings.bikes = [createDefaultBike("bike-tenere", "Ténéré 700", "adventure")]
  settings.activeBikeId = "bike-tenere"
  saveRiderSettings(settings)
})

describe("SettingsDestination", () => {
  it("renders Settings as a destination with the active motorcycle as the primary object", () => {
    render(<SettingsDestination theme="auto" onThemeChange={vi.fn()} onOpenAdvancedSettings={vi.fn()} />)

    expect(screen.getByRole("region", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument()
    const activeMotorcycle = screen.getByRole("region", { name: "Active motorcycle" })
    expect(activeMotorcycle).toHaveTextContent("Ténéré 700")
    expect(activeMotorcycle).toHaveTextContent("Adventure")
    expect(document.querySelector(".profile-panel")).not.toBeInTheDocument()
  })

  it("writes rider and motorcycle edits through the existing versioned settings source", () => {
    render(<SettingsDestination theme="auto" onThemeChange={vi.fn()} onOpenAdvancedSettings={vi.fn()} />)

    fireEvent.change(screen.getByRole("textbox", { name: "Rider name" }), { target: { value: "Zac H" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Motorcycle name" }), { target: { value: "T7 World Raid" } })
    fireEvent.change(screen.getByRole("spinbutton", { name: "Fuel range in miles" }), { target: { value: "215" } })

    const persisted = loadRiderSettings()
    expect(persisted.riderName).toBe("Zac H")
    expect(persisted.activeBikeId).toBe("bike-tenere")
    expect(persisted.bikes[0]).toMatchObject({ id: "bike-tenere", name: "T7 World Raid", fuelRangeMiles: 215 })
  })

  it("persists route defaults and keeps theme synchronized through the shell callback", () => {
    const onThemeChange = vi.fn()
    render(<SettingsDestination theme="auto" onThemeChange={onThemeChange} onOpenAdvancedSettings={vi.fn()} />)

    fireEvent.change(screen.getByRole("combobox", { name: "Default route style" }), { target: { value: "twisty" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Avoid highways by default" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "dark" } })

    expect(loadRiderSettings()).toMatchObject({ defaultProfile: "twisty", defaultAvoidHighways: true, theme: "dark" })
    expect(onThemeChange).toHaveBeenCalledWith("dark")
  })

  it("keeps curated UI customization and advanced account/data tools reachable without duplicating them", () => {
    const onOpenAdvancedSettings = vi.fn()
    render(<SettingsDestination theme="auto" onThemeChange={vi.fn()} onOpenAdvancedSettings={onOpenAdvancedSettings} />)

    expect(screen.getByRole("region", { name: "Customize Switchback" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Account, sync & data" }))
    expect(onOpenAdvancedSettings).toHaveBeenCalledOnce()
  })
})
