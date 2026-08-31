import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SettingsSurface } from "@/components/settings/SettingsSurface"
import { createDefaultSettings } from "@/lib/settings/rider-settings"

describe("SettingsSurface", () => {
  it("communicates the active bike before identity, sync, or diagnostics", () => {
    const settings = createDefaultSettings()
    settings.bikes = [{
      id: "crf300l",
      name: "CRF300L",
      category: "dual-sport",
      fuelRangeMiles: 150,
      reserveMiles: 25,
      maintainedGravel: true,
      roughTracks: true,
      unknownSurfacePolicy: "allow"
    }]
    settings.activeBikeId = "crf300l"

    render(<SettingsSurface settings={settings} onChangeBike={vi.fn()} onEditBike={vi.fn()} />)

    expect(screen.getByRole("region", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByText("CRF300L")).toBeInTheDocument()
    expect(screen.getByText(/Dual Sport/)).toBeInTheDocument()
    expect(screen.getByText(/150 mi range/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Change active bike" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit CRF300L" })).toBeInTheDocument()
    expect(screen.queryByText(/diagnostics|recovery kit|passkey/i)).not.toBeInTheDocument()
  })
})
