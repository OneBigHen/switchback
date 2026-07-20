import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DOWNLOAD_MODE_PICKER_DEFAULT,
  DownloadModePicker,
  type DownloadModePickerValue
} from "@/components/planner/DownloadModePicker"
import { SAVED_RIDE_CORRIDOR_DEFAULT_MILES } from "@/lib/offline/download-mode"

function renderPicker(value: DownloadModePickerValue, onChange: (next: DownloadModePickerValue) => void = () => {}) {
  return render(<DownloadModePicker value={value} onChange={onChange} />)
}

describe("DownloadModePicker", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders all three download scope options", () => {
    renderPicker(DOWNLOAD_MODE_PICKER_DEFAULT)

    expect(screen.getByText("Routing only")).toBeInTheDocument()
    expect(screen.getByText("Full offline region")).toBeInTheDocument()
    expect(screen.getByText("Saved ride corridor")).toBeInTheDocument()
  })

  it("defaults to saved-ride-corridor before pressing Start Ride", () => {
    expect(DOWNLOAD_MODE_PICKER_DEFAULT.level).toBe("saved-ride-corridor")
    expect(DOWNLOAD_MODE_PICKER_DEFAULT.corridorMiles).toBe(SAVED_RIDE_CORRIDOR_DEFAULT_MILES.street)
  })

  it("marks the saved-ride-corridor option as the easiest (recommended) default", () => {
    renderPicker(DOWNLOAD_MODE_PICKER_DEFAULT)
    const easiest = screen.getByText("Saved ride corridor").closest(".download-mode-option-title")
    expect(easiest?.getAttribute("data-recommended")).toBe("true")
  })

  it("renders the corridor trip-style presets when saved-ride-corridor is selected", () => {
    renderPicker(DOWNLOAD_MODE_PICKER_DEFAULT)

    expect(screen.getByText("Street")).toBeInTheDocument()
    expect(screen.getByText("Adventure")).toBeInTheDocument()
    expect(screen.getByText("Multi-day")).toBeInTheDocument()
    expect(screen.getByText("10")).toBeInTheDocument()
    expect(screen.getByText("20")).toBeInTheDocument()
    expect(screen.getByText("30")).toBeInTheDocument()
  })

  it("does not render the corridor presets for routing-only", () => {
    renderPicker({ level: "routing-only", corridorMiles: 0 })

    expect(screen.queryByText("Street")).not.toBeInTheDocument()
    expect(screen.queryByText("Multi-day")).not.toBeInTheDocument()
  })

  it("emits the selected trip-style's corridor miles when a preset is chosen", () => {
    const onChange = vi.fn()
    renderPicker(DOWNLOAD_MODE_PICKER_DEFAULT, onChange)

    fireEvent.click(screen.getByText("Adventure"))

    expect(onChange).toHaveBeenCalledWith({
      level: "saved-ride-corridor",
      corridorMiles: SAVED_RIDE_CORRIDOR_DEFAULT_MILES.adventure
    })
  })

  it("collapses back to the street default when the rider switches from routing-only to saved-ride-corridor", () => {
    const onChange = vi.fn()
    renderPicker({ level: "routing-only", corridorMiles: 0 }, onChange)

    fireEvent.click(screen.getByText("Saved ride corridor"))

    expect(onChange).toHaveBeenCalledWith({
      level: "saved-ride-corridor",
      corridorMiles: SAVED_RIDE_CORRIDOR_DEFAULT_MILES.street
    })
  })

  it("zeros out the corridor miles when the rider switches to a non-corridor level", () => {
    const onChange = vi.fn()
    renderPicker(DOWNLOAD_MODE_PICKER_DEFAULT, onChange)

    fireEvent.click(screen.getByText("Routing only"))

    expect(onChange).toHaveBeenCalledWith({
      level: "routing-only",
      corridorMiles: 0
    })
  })

  it("marks the currently selected corridor preset as selected", () => {
    renderPicker({
      level: "saved-ride-corridor",
      corridorMiles: SAVED_RIDE_CORRIDOR_DEFAULT_MILES.multiday
    })

    const multidayOption = screen.getByText("Multi-day").closest(".download-mode-corridor-option")
    expect(multidayOption?.getAttribute("data-selected")).toBe("true")

    const streetOption = screen.getByText("Street").closest(".download-mode-corridor-option")
    expect(streetOption?.getAttribute("data-selected")).toBe("false")
  })
})
