import { describe, expect, it } from "vitest"
import {
  TELEMETRY_ACKNOWLEDGEMENT_STORAGE_KEY,
  hasCurrentTelemetryAcknowledgement,
  readTelemetryAcknowledgement,
  writeTelemetryAcknowledgement
} from "@/lib/telemetry/consent"

describe("telemetry acknowledgement", () => {
  it("stores a versioned decision and timestamp without starting telemetry", () => {
    const storage = new Map<string, string>()
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }

    const acknowledgement = writeTelemetryAcknowledgement(fakeStorage, "accepted", "2026-09-14T13:00:00.000Z")

    expect(storage.has(TELEMETRY_ACKNOWLEDGEMENT_STORAGE_KEY)).toBe(true)
    expect(acknowledgement).toEqual({
      version: "2026-09-14.v1",
      decision: "accepted",
      acknowledgedAt: "2026-09-14T13:00:00.000Z"
    })
    expect(readTelemetryAcknowledgement(fakeStorage)).toEqual(acknowledgement)
  })

  it("only treats an accepted acknowledgement for the current copy as valid", () => {
    const storage = new Map<string, string>()
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }

    writeTelemetryAcknowledgement(fakeStorage, "declined", "2026-09-14T13:00:00.000Z")
    expect(hasCurrentTelemetryAcknowledgement(fakeStorage)).toBe(false)

    storage.set(TELEMETRY_ACKNOWLEDGEMENT_STORAGE_KEY, JSON.stringify({
      version: "old-copy",
      decision: "accepted",
      acknowledgedAt: "2026-09-14T13:00:00.000Z"
    }))
    expect(hasCurrentTelemetryAcknowledgement(fakeStorage)).toBe(false)
  })
})
