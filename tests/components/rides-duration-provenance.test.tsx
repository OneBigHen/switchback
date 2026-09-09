import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RidesSurface, type RideLibraryItem } from "@/components/rides/RidesSurface"
import { normalizeRideLibrary } from "@/components/rides/rides-view-model"
import type { RecordedRide } from "@/lib/storage/ride-journal"
import { comparePlannedVsActual } from "@/lib/client/replay-comparison"

afterEach(cleanup)

/**
 * A recorded ride's duration must be the time the rider actually spent, or be
 * marked as something else. It must never be the plan wearing the recording's
 * clothes.
 *
 * `recordedDurationMinutes` fell back to `ride.route.durationMinutes` whenever
 * `startedAt`/`endedAt` could not be parsed, and the card printed the result as
 * a bare "N min" under the heading "Recorded ride". A ride whose timestamps
 * were lost therefore reported the planned duration as elapsed time, with
 * nothing to distinguish it from a real measurement.
 */

function recordedRide(overrides: Partial<RecordedRide> = {}): RecordedRide {
  return {
    id: "ride-1",
    routeId: "route-1",
    routeName: "Sunday loop",
    route: {
      id: "route-1",
      name: "Sunday loop",
      distanceMiles: 61.2,
      durationMinutes: 104,
      geometry: [[-75.2, 40.4], [-75.1, 40.5]]
    },
    points: [],
    notes: "",
    photos: [],
    startedAt: "2026-08-30T12:00:00Z",
    endedAt: "2026-08-30T14:05:00Z",
    createdAt: "2026-08-30T12:00:00Z",
    updatedAt: "2026-08-30T14:05:00Z",
    ...overrides
  } as unknown as RecordedRide
}

function itemFor(ride: RecordedRide): RideLibraryItem {
  return normalizeRideLibrary({ recordedRides: [ride] })[0]!
}

describe("recorded duration provenance", () => {
  it("reports measured elapsed time as recorded", () => {
    const item = itemFor(recordedRide())

    expect(item.durationMinutes).toBe(125)
    expect(item.durationSource).toBe("recorded")
  })

  it("never passes the planned duration off as elapsed time", () => {
    const item = itemFor(recordedRide({ endedAt: "not-a-date" }))

    // The plan is 104 minutes. Whatever the card shows, it may not claim that
    // number was measured.
    expect(item.durationSource).not.toBe("recorded")
  })

  it("marks a duration the rider can see as planned when the recording lost its clock", () => {
    const item = itemFor(recordedRide({ startedAt: "", endedAt: "" }))
    render(<RidesSurface items={[item]} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(item.durationSource).toBe("planned")
    // Visible, not just present in the model: a rider reading the card must be
    // able to tell this is the plan. Matched against the duration itself — the
    // surface also has a "Planned" ride-type filter, which is a different word
    // doing a different job.
    expect(screen.getByText(/\d+ min planned/i)).toBeInTheDocument()
  })

  it("does not clutter a genuine recording with a provenance label", () => {
    render(<RidesSurface items={[itemFor(recordedRide())]} onOpen={vi.fn()} onImport={vi.fn()} />)

    expect(screen.queryByText(/min planned/i)).not.toBeInTheDocument()
    expect(screen.getByText(/125 min/)).toBeInTheDocument()
  })

  it("treats a route's own duration as planned without apology", () => {
    const [item] = normalizeRideLibrary({
      savedRoutes: [{
        id: "saved-1",
        name: "Ridge run",
        distanceMiles: 82.4,
        durationMinutes: 146,
        updatedAt: "2026-08-28T12:00:00Z",
        geometry: [[-77.4, 41.5], [-77.3, 41.6]],
        tags: []
      } as never]
    })

    expect(item!.durationSource).toBe("planned")
  })

  /**
   * The same claim in a different disguise. `comparePlannedVsActual` returned 0
   * for an unreadable clock, and a consumer cannot tell that apart from a ride
   * that genuinely took no time. Nothing renders this field today, which is
   * precisely why it was worth fixing before something does.
   */
  it("reports an unreadable recording clock as unknown, not as zero minutes", () => {
    const ride = recordedRide({ startedAt: "", endedAt: "" })
    const result = comparePlannedVsActual(ride.route, ride)

    expect(result.recordedDurationMinutes).toBeNull()
  })

  it("still reports a readable clock as a real measurement", () => {
    const ride = recordedRide()
    const result = comparePlannedVsActual(ride.route, ride)

    expect(result.recordedDurationMinutes).toBe(125)
  })
})
