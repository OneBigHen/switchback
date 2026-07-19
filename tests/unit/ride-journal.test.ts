import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { RideJournalLibrary, summarizeRecordedRide } from "@/lib/storage/ride-journal"
import type { PlannedRoute } from "@/lib/routing/types"

const route: PlannedRoute = {
  id: "journal-route", name: "Journal ridge", profile: "twisty",
  geometry: [[-77, 40], [-76.9, 40.1]], waypoints: [], instructions: [],
  distanceMiles: 12, durationMinutes: 20, ascentMeters: null, descentMeters: null,
  twistiness: 66, turnCount: 20, roadMix: {}, surfaceMix: {}, routingSource: "live", previewOnly: false
}

describe("ride journal", () => {
  let journal: RideJournalLibrary

  beforeEach(() => {
    journal = new RideJournalLibrary(`switchback-journal-${crypto.randomUUID()}`)
  })
  afterEach(async () => journal.destroy())

  it("keeps a private replay line with notes and photos on the rider device", async () => {
    const recorded = await journal.save({
      route,
      points: [
        { coordinate: [-77, 40], recordedAt: "2026-07-15T10:00:00.000Z", speedMph: 0 },
        { coordinate: [-76.9, 40.1], recordedAt: "2026-07-15T10:20:00.000Z", speedMph: 35 }
      ],
      notes: "Fog lifted at the ridge",
      photos: [{ id: "photo-1", caption: "Overlook", takenAt: "2026-07-15T10:10:00.000Z" }]
    })

    expect(recorded.points).toHaveLength(2)
    expect(recorded.notes).toContain("Fog")
    expect((await journal.list()).map((ride) => ride.id)).toEqual([recorded.id])
    expect(summarizeRecordedRide(recorded)).toMatchObject({ durationMinutes: 20, photoCount: 1 })
  })
})
