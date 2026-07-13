import { useState } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WaypointField } from "@/components/planner/WaypointField"
import { searchPlacesClient } from "@/lib/client/geocoding-client"
import type { Waypoint } from "@/lib/routing/types"

vi.mock("@/lib/client/geocoding-client", () => ({
  searchPlacesClient: vi.fn()
}))

const places = [
  {
    id: "york-pa",
    name: "York",
    label: "York, Pennsylvania, United States",
    lat: 39.9626,
    lon: -76.7277,
    region: "Pennsylvania",
    country: "United States"
  },
  {
    id: "york-haven-pa",
    name: "York Haven",
    label: "York Haven, Pennsylvania, United States",
    lat: 40.1109,
    lon: -76.7158,
    region: "Pennsylvania",
    country: "United States"
  }
]

function Harness({ onSelect = vi.fn() }: { onSelect?: (point: Waypoint) => void }) {
  const [query, setQuery] = useState("York")
  return (
    <WaypointField
      id="finish"
      label="Finish"
      point={null}
      query={query}
      armed={false}
      onSelect={onSelect}
      onQueryChange={setQuery}
      onArm={vi.fn()}
    />
  )
}

async function finishDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(280)
  })
}

describe("waypoint combobox", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(searchPlacesClient).mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("tracks the active option with arrows and selects it with Enter", async () => {
    const onSelect = vi.fn()
    vi.mocked(searchPlacesClient).mockResolvedValue(places)
    render(<Harness onSelect={onSelect} />)
    await finishDebounce()

    const input = screen.getByRole("combobox", { name: "Finish" })
    const options = screen.getAllByRole("option")
    expect(input).toHaveAttribute("aria-expanded", "true")
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id)
    expect(options[0]).toHaveAttribute("aria-selected", "true")
    expect(options[1]).toHaveAttribute("aria-selected", "false")
    expect(options[0].tagName).toBe("BUTTON")
    expect(options[0].closest("li")).toHaveAttribute("role", "none")

    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id)
    expect(options[1]).toHaveAttribute("aria-selected", "true")

    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id)
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(onSelect).toHaveBeenCalledWith({
      lat: places[1].lat,
      lon: places[1].lon,
      label: places[1].label
    })
    expect(input).toHaveAttribute("aria-expanded", "false")
  })

  it("dismisses suggestions with Escape", async () => {
    vi.mocked(searchPlacesClient).mockResolvedValue(places)
    render(<Harness />)
    await finishDebounce()

    const input = screen.getByRole("combobox", { name: "Finish" })
    fireEvent.keyDown(input, { key: "Escape" })

    expect(input).toHaveAttribute("aria-expanded", "false")
    expect(input).not.toHaveAttribute("aria-activedescendant")
  })

  it("announces busy and failed search states from the combobox", async () => {
    let rejectSearch!: (reason: Error) => void
    vi.mocked(searchPlacesClient).mockReturnValue(new Promise((_, reject) => {
      rejectSearch = reject
    }))
    render(<Harness />)

    await act(async () => {
      vi.advanceTimersByTime(280)
    })
    const input = screen.getByRole("combobox", { name: "Finish" })
    expect(input).toHaveAttribute("aria-busy", "true")

    await act(async () => {
      rejectSearch(new Error("Place search is unavailable."))
    })
    const error = screen.getByRole("status")
    expect(error).toHaveTextContent("Place search is unavailable.")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-describedby", error.id)
    expect(input).toHaveAttribute("aria-busy", "false")
  })
})
