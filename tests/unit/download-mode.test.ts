import { describe, expect, it } from "vitest"
import {
  OFFLINE_DOWNLOAD_LEVELS,
  SAVED_RIDE_CORRIDOR_DEFAULT_MILES,
  corridorMilesToHalfWidthMeters,
  getDownloadLevelOption
} from "@/lib/offline/download-mode"

describe("offline download level", () => {
  it("exposes routing-only, full-region, and saved-ride-corridor options", () => {
    const ids = OFFLINE_DOWNLOAD_LEVELS.map((o) => o.level)
    expect(ids).toEqual(["routing-only", "full-region", "saved-ride-corridor"])
  })

  it("saved-ride-corridor advertises corridor mile defaults", () => {
    const option = getDownloadLevelOption("saved-ride-corridor")!
    expect(option.defaultCorridorMiles).toBe(10)
  })

  it("defaults match the lead decision: 10 / 20 / 30 miles", () => {
    expect(SAVED_RIDE_CORRIDOR_DEFAULT_MILES.street).toBe(10)
    expect(SAVED_RIDE_CORRIDOR_DEFAULT_MILES.adventure).toBe(20)
    expect(SAVED_RIDE_CORRIDOR_DEFAULT_MILES.multiday).toBe(30)
  })

  it("corridorMilesToHalfWidthMeters converts and floors at 50m", () => {
    expect(corridorMilesToHalfWidthMeters(10)).toBeGreaterThan(14_000)
    expect(corridorMilesToHalfWidthMeters(0)).toBe(50)
  })

  it("getDownloadLevelOption returns undefined for unknown levels", () => {
    expect(getDownloadLevelOption("ultra" as never)).toBeUndefined()
  })
})
