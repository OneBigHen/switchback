import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RideRecordingHud } from "@/components/shell/RideRecordingHud"
import { useRecordingSession, type RecordingSessionController } from "@/components/shell/useRecordingSession"
import { createRecordingState } from "@/lib/client/recording-session"

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

function deniedGeolocation() {
  const clearWatch = vi.fn()
  const watchPosition = vi.fn((
    _success: PositionCallback,
    error: PositionErrorCallback
  ) => {
    error({
      code: 1,
      message: "User denied Geolocation",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3
    } as GeolocationPositionError)
    return 7
  })
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { clearWatch, watchPosition }
  })
  return { clearWatch, watchPosition }
}

describe("recording permission-denial recovery", () => {
  it("keeps a just-started denied recording active so PlannerShell cannot drop its HUD", () => {
    deniedGeolocation()
    const { result } = renderHook(() => useRecordingSession())

    act(() => result.current.start())

    expect(result.current.state.status).toBe("denied")
    expect(result.current.state.startedAt).toEqual(expect.any(Number))
    expect(result.current.isActive).toBe(true)
  })

  it("shows retry, finish, and discard actions on a denied recording HUD", () => {
    const retryGps = vi.fn()
    const finish = vi.fn()
    const discard = vi.fn()
    const denied = {
      ...createRecordingState(),
      status: "denied" as const,
      startedAt: 100,
      error: "Location permission was denied. Enable precise location for Switchback and try again."
    }
    const controller = {
      state: denied,
      clock: 200,
      elapsedMillis: 100,
      isActive: true,
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      retryGps,
      finish,
      discard
    } as unknown as RecordingSessionController

    render(<RideRecordingHud controller={controller} />)

    fireEvent.click(screen.getByRole("button", { name: "Try GPS again" }))
    fireEvent.click(screen.getByRole("button", { name: "Finish & save" }))
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))

    expect(retryGps).toHaveBeenCalledOnce()
    expect(finish).toHaveBeenCalledOnce()
    expect(discard).toHaveBeenCalledOnce()
  })
})
