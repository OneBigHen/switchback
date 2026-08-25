import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RecordPanel } from "@/components/shell/RecordPanel"
import { createRecordingState, type RecordingSessionState } from "@/lib/client/recording-session"
import type { RecordingSessionController } from "@/components/shell/useRecordingSession"
import type { RecordedRidePoint } from "@/lib/storage/ride-journal"

function controller(state: RecordingSessionState, overrides: Partial<RecordingSessionController> = {}) {
  return {
    state,
    clock: Date.now(),
    elapsedMillis: 0,
    isActive: state.status === "recording" || state.status === "paused",
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    finish: vi.fn(),
    discard: vi.fn(),
    ...overrides
  } as RecordingSessionController
}

describe("RecordPanel", () => {
  beforeEach(() => localStorage.clear())

  it("starts a local recording from the idle state", () => {
    const handlers = controller(createRecordingState())
    render(<RecordPanel controller={handlers} />)

    expect(screen.getByRole("heading", { name: "Record a ride" })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }))

    expect(handlers.start).toHaveBeenCalledOnce()
  })

  it("shows pause and finish while recording", () => {
    const recording = { ...createRecordingState(), status: "recording" as const, startedAt: Date.now() }
    const handlers = controller(recording)
    render(<RecordPanel controller={handlers} />)

    expect(screen.getByText("Recording locally")).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Pause recording" }))
    fireEvent.click(screen.getByRole("button", { name: "Finish" }))

    expect(handlers.pause).toHaveBeenCalledOnce()
    expect(handlers.finish).toHaveBeenCalledOnce()
  })

  it("plots the recorded GPS coordinates instead of a synthetic breadcrumb", () => {
    const points: RecordedRidePoint[] = [
      { coordinate: [-77, 40], recordedAt: "2026-08-24T12:00:00.000Z", speedMph: 30 },
      { coordinate: [-76.9, 40.1], recordedAt: "2026-08-24T12:01:00.000Z", speedMph: 30 }
    ]
    const recording = {
      ...createRecordingState(),
      status: "recording" as const,
      startedAt: 100,
      points
    }

    render(<RecordPanel controller={controller(recording)} />)

    expect(screen.getByRole("img", { name: "Recorded breadcrumb preview" }).querySelector("polyline"))
      .toHaveAttribute("points", "12.00,128.00 308.00,12.00")
  })

  it("shows a recover action for an interrupted session", () => {
    const paused = {
      ...createRecordingState(),
      status: "paused" as const,
      startedAt: 100,
      pausedAt: 200,
      pausedMillis: 0
    }
    const handlers = controller(paused)
    render(<RecordPanel controller={handlers} />)

    expect(screen.getByRole("button", { name: "Resume recovered recording" })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Resume recovered recording" }))
    expect(handlers.resume).toHaveBeenCalledOnce()
  })
})
