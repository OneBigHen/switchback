import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RecordPanel } from "@/components/shell/RecordPanel"
import { createRecordingState, type RecordingSessionState } from "@/lib/client/recording-session"
import type { RecordingSessionController } from "@/components/shell/useRecordingSession"

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
