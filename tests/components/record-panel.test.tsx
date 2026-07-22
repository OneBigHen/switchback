import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RecordPanel } from "@/components/shell/RecordPanel"

describe("RecordPanel", () => {
  beforeEach(() => localStorage.clear())

  it("surfaces GPS readiness and begins a local recording", () => {
    const watchPosition = vi.fn(() => 7)
    const clearWatch = vi.fn()
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { watchPosition, clearWatch }
    })

    render(<RecordPanel onFinish={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "Record a ride" })).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }))

    expect(watchPosition).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "Pause recording" })).toBeVisible()
    expect(screen.getByText("Recording locally")).toBeVisible()
  })

  it("shows a recover action for an interrupted session", () => {
    localStorage.setItem("switchback:active-recording", JSON.stringify({
      status: "recording",
      startedAt: 100,
      pausedAt: null,
      pausedMillis: 0,
      endedAt: null,
      points: []
    }))

    render(<RecordPanel onFinish={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Resume recovered recording" })).toBeVisible()
  })
})
