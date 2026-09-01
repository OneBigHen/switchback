import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RidesDestination } from "@/components/rides/RidesDestination"
import type { SavedRoute } from "@/lib/storage/route-library"
import type { TripPlan } from "@/lib/trip/trip-plan"
import type { RecordedRide } from "@/lib/storage/ride-journal"

afterEach(cleanup)

const importedRoute = {
  id: "saved-imported",
  name: "Pine Creek import",
  folder: "Weekend",
  tags: ["pine", "gravel"],
  visible: true,
  routingSource: "imported",
  distanceMiles: 82.4,
  durationMinutes: 146,
  updatedAt: "2026-08-28T12:00:00Z"
} as unknown as SavedRoute

const trip = {
  id: "trip-1",
  name: "Allegheny weekend",
  stages: [{ id: "stage-1" }],
  route: {
    distanceMiles: 231.7,
    durationMinutes: 418
  },
  updatedAt: "2026-08-29T12:00:00Z"
} as unknown as TripPlan

const recordedRide = {
  id: "recorded-1",
  routeName: "Sunday replay",
  route: { name: "Sunday replay", distanceMiles: 42, durationMinutes: 70 },
  startedAt: "2026-08-30T12:00:00Z",
  endedAt: "2026-08-30T13:10:00Z",
  updatedAt: "2026-08-30T13:10:00Z",
  photos: []
} as unknown as RecordedRide

function renderDestination(overrides: Partial<React.ComponentProps<typeof RidesDestination>> = {}) {
  const props: React.ComponentProps<typeof RidesDestination> = {
    routes: [importedRoute],
    trips: [trip],
    recordedRides: [recordedRide],
    onClose: vi.fn(),
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    onImport: vi.fn(),
    onMatchImported: vi.fn(),
    onOrganize: vi.fn(),
    onDeleteTrip: vi.fn(),
    onDeleteRecorded: vi.fn(),
    ...overrides
  }
  render(<RidesDestination {...props} />)
  return props
}

describe("RidesDestination management", () => {
  it("keeps imported-route mutations contextual and dispatches the original storage object", () => {
    const props = renderDestination()

    fireEvent.click(screen.getByRole("button", { name: "Manage Pine Creek import" }))
    expect(screen.getByRole("button", { name: "Match roads" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Hide route" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Folder" })).toHaveValue("Weekend")
    expect(screen.getByRole("textbox", { name: "Tags" })).toHaveValue("pine, gravel")

    fireEvent.click(screen.getByRole("button", { name: "Match roads" }))
    expect(props.onMatchImported).toHaveBeenCalledWith(importedRoute)

    fireEvent.click(screen.getByRole("button", { name: "Hide route" }))
    expect(props.onOrganize).toHaveBeenCalledWith(importedRoute, { visible: false })

    fireEvent.change(screen.getByRole("textbox", { name: "Folder" }), { target: { value: "ADV" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Tags" }), { target: { value: "forest, weekend" } })
    fireEvent.click(screen.getByRole("button", { name: "Save organization" }))
    expect(props.onOrganize).toHaveBeenCalledWith(importedRoute, {
      folder: "ADV",
      tags: ["forest", "weekend"]
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete route" }))
    expect(props.onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete route" }))
    expect(props.onDelete).toHaveBeenCalledWith(importedRoute)
  })

  it("preserves guarded trip deletion without turning the row into a permanent toolbar", () => {
    const props = renderDestination()

    expect(screen.queryByRole("button", { name: "Delete trip" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Manage Allegheny weekend" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete trip" }))
    expect(props.onDeleteTrip).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete trip" }))
    expect(props.onDeleteTrip).toHaveBeenCalledWith(trip)
  })

  it("deletes a recorded ride through its original journal object after confirmation", () => {
    const props = renderDestination()
    fireEvent.click(screen.getByRole("button", { name: "Manage Sunday replay" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete recording" }))
    expect(props.onDeleteRecorded).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete recording" }))
    expect(props.onDeleteRecorded).toHaveBeenCalledWith(recordedRide)
  })
})
