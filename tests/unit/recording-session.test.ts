import { describe, expect, it } from "vitest"
import {
  createRecordingState,
  recordingSessionReducer
} from "@/lib/client/recording-session"

describe("standalone recording session", () => {
  it("starts, pauses, resumes, and finishes without dropping collected points", () => {
    const started = recordingSessionReducer(createRecordingState(), { type: "start", at: 100 })
    const sampled = recordingSessionReducer(started, {
      type: "sample",
      point: { coordinate: [-76.88, 40.27], recordedAt: "2026-07-21T12:00:00Z", speedMph: 20 }
    })
    const paused = recordingSessionReducer(sampled, { type: "pause", at: 200 })
    const ignored = recordingSessionReducer(paused, {
      type: "sample",
      point: { coordinate: [-76.87, 40.28], recordedAt: "2026-07-21T12:01:00Z", speedMph: 25 }
    })
    const resumed = recordingSessionReducer(ignored, { type: "resume", at: 300 })
    const finished = recordingSessionReducer(resumed, { type: "finish", at: 400 })

    expect(finished.status).toBe("finished")
    expect(finished.points).toHaveLength(1)
    expect(finished.pausedMillis).toBe(100)
  })

  it("recovers an interrupted active recording as paused", () => {
    const recovered = recordingSessionReducer(createRecordingState(), {
      type: "recover",
      snapshot: {
        status: "recording",
        startedAt: 100,
        pausedAt: null,
        pausedMillis: 0,
        endedAt: null,
        points: []
      }
    })

    expect(recovered.status).toBe("paused")
    expect(recovered.pausedAt).toEqual(expect.any(Number))
  })

  it("records permission denial as an actionable state", () => {
    const denied = recordingSessionReducer(createRecordingState(), {
      type: "permission_denied",
      message: "Location permission was denied."
    })

    expect(denied.status).toBe("denied")
    expect(denied.error).toMatch(/denied/i)
  })
})
