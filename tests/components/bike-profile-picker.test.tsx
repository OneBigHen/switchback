import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BikeProfilePicker } from "@/components/planner/BikeProfilePicker"
import { MOTORCYCLE_PROFILES } from "@/lib/routing/bike-profiles"
import type { BikeProfile } from "@/lib/routing/bike-profiles"

afterEach(cleanup)

function street(): BikeProfile {
  return { ...MOTORCYCLE_PROFILES[0]! }
}

function adventure(): BikeProfile {
  return { ...MOTORCYCLE_PROFILES[2]! }
}

describe("BikeProfilePicker", () => {
  it("renders the four preset categories as a segmented control", () => {
    render(<BikeProfilePicker value={street()} onChange={() => {}} />)
    expect(screen.getAllByText("Street").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Touring").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Adventure").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Dual-Sport").length).toBeGreaterThan(0)
  })

  it("marks the active preset as selected via aria-checked", () => {
    render(<BikeProfilePicker value={adventure()} onChange={() => {}} />)
    const optionGroup = screen.getByRole("radiogroup", { name: /motorcycle bike profile preset/i })
    const adventureButton = optionGroup.querySelector("button:nth-child(3)")!
    expect(adventureButton).toHaveAttribute("aria-checked", "true")
    const streetButton = optionGroup.querySelector("button:nth-child(1)")!
    expect(streetButton).toHaveAttribute("aria-checked", "false")
  })

  it("emits the chosen preset on selection", () => {
    const onChange = vi.fn()
    render(<BikeProfilePicker value={street()} onChange={onChange} />)
    const optionGroup = screen.getByRole("radiogroup", { name: /motorcycle bike profile preset/i })
    const adventureButton = optionGroup.querySelector("button:nth-child(3)")! as HTMLButtonElement
    fireEvent.click(adventureButton)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].category).toBe("adventure")
  })

  it("surfaces a profile mismatch hint when the routing profile does not match the bike", () => {
    render(<BikeProfilePicker value={street()} onChange={() => {}} routingProfile="adventure" />)
    expect(screen.getByText(/Profile mismatch/i)).toBeInTheDocument()
  })

  it("does not show a mismatch hint when bike + routing profile align", () => {
    render(<BikeProfilePicker value={adventure()} onChange={() => {}} routingProfile="adventure" />)
    expect(screen.queryByText(/Profile mismatch/i)).not.toBeInTheDocument()
  })

  it("exposes editable fields (fuel range, reserve, allowMaintainedGravel) when expanded", () => {
    render(<BikeProfilePicker value={street()} onChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /edit bike profile fields/i }))
    expect(screen.getByLabelText("Fuel range in miles")).toBeInTheDocument()
    expect(screen.getByLabelText("Reserve fuel range in miles")).toBeInTheDocument()
    expect(screen.getByLabelText("Allow maintained gravel")).toBeInTheDocument()
  })

  it("emits a fuel range update when the editable field changes", () => {
    const onChange = vi.fn()
    render(<BikeProfilePicker value={street()} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /edit bike profile fields/i }))
    const input = screen.getByLabelText("Fuel range in miles") as HTMLInputElement
    fireEvent.change(input, { target: { value: "210" } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].fuelRangeMiles).toBe(210)
  })

  it("ignores out-of-range fuel range updates", () => {
    const onChange = vi.fn()
    render(<BikeProfilePicker value={street()} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /edit bike profile fields/i }))
    const input = screen.getByLabelText("Fuel range in miles") as HTMLInputElement
    fireEvent.change(input, { target: { value: "9999" } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("toggles allowMaintainedGravel on click", () => {
    const onChange = vi.fn()
    render(<BikeProfilePicker value={street()} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: /edit bike profile fields/i }))
    const checkbox = screen.getByLabelText("Allow maintained gravel") as HTMLInputElement
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].allowMaintainedGravel).toBe(true)
  })
})
