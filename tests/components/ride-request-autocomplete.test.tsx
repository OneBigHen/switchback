import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { RideRequestAutocomplete } from "@/components/planner/v2/RideRequestAutocomplete"

const places = [
  {
    id: "austin-tx",
    label: "Austin, Texas, United States",
    name: "Austin",
    region: "Texas",
    country: "United States",
    lat: 30.2672,
    lon: -97.7431
  },
  {
    id: "austin-pa",
    label: "Austin, Pennsylvania, United States",
    name: "Austin",
    region: "Pennsylvania",
    country: "United States",
    lat: 41.64,
    lon: -78.09
  }
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function Harness({ mode = "destination" as const }) {
  const [value, setValue] = useState("")
  return (
    <RideRequestAutocomplete
      id="ride-prompt"
      name="ride-prompt"
      planMode={mode}
      value={value}
      placeholder="Search a place or describe a ride"
      disabled={false}
      bias={{ lat: 40.2732, lon: -76.8867 }}
      onChange={setValue}
    />
  )
}

describe("primary ride request autocomplete", () => {
  it("shows accessible geocoder suggestions while typing and completes the selected place", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json({ places })))
    const user = userEvent.setup()
    render(<Harness />)

    const input = screen.getByRole("combobox", { name: "Ride request" })
    await user.type(input, "Aus")

    await waitFor(() => expect(screen.getByRole("listbox", { name: "Place suggestions" })).toBeInTheDocument())
    expect(screen.getByRole("option", { name: /Austin, Texas/i })).toBeInTheDocument()
    expect(input).toHaveAttribute("aria-autocomplete", "list")

    await user.click(screen.getByRole("option", { name: /Austin, Texas/i }))
    expect(input).toHaveValue("Ride to Austin, Texas, United States")
  })

  it("preserves typed ride constraints when a location suggestion is chosen", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json({ places })))
    const user = userEvent.setup()
    render(<Harness mode="loop" />)

    const input = screen.getByRole("combobox", { name: "Ride request" })
    await user.type(input, "90-minute scenic loop near Aus")

    await waitFor(() => expect(screen.getByRole("option", { name: /Austin, Texas/i })).toBeInTheDocument())
    await user.click(screen.getByRole("option", { name: /Austin, Texas/i }))

    expect(input).toHaveValue("90-minute scenic loop near Austin, Texas, United States")
  })

  it("supports arrow selection, Enter completion, and Escape dismissal", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => Response.json({ places })))
    const user = userEvent.setup()
    render(<Harness />)

    const input = screen.getByRole("combobox", { name: "Ride request" })
    await user.type(input, "Aus")
    await waitFor(() => expect(screen.getByRole("listbox", { name: "Place suggestions" })).toBeInTheDocument())

    await user.keyboard("{ArrowDown}{Enter}")
    expect(input).toHaveValue("Ride to Austin, Pennsylvania, United States")

    await user.clear(input)
    await user.type(input, "Aus")
    await waitFor(() => expect(screen.getByRole("listbox", { name: "Place suggestions" })).toBeInTheDocument())
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("listbox", { name: "Place suggestions" })).not.toBeInTheDocument()
  })

  it("sends the current route start only as a provider bias, never as a hard replacement", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ places }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByRole("combobox", { name: "Ride request" }), "Austin")
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const requested = String(fetchMock.mock.calls[0]?.[0])
    expect(requested).toContain("q=Austin")
    expect(requested).toContain("lat=40.2732")
    expect(requested).toContain("lon=-76.8867")
  })
})
