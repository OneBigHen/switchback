import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
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

function controlledGeolocation() {
  const clearWatch = vi.fn()
  const callbacks: Array<{ success: PositionCallback; error: PositionErrorCallback }> = []
  const watchPosition = vi.fn((success: PositionCallback, error: PositionErrorCallback) => {
    callbacks.push({ success, error })
    return callbacks.length
  })
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { clearWatch, watchPosition }
  })
  return { callbacks, clearWatch, watchPosition }
}

function permissionError(): GeolocationPositionError {
  return {
    code: 1,
    message: "User denied Geolocation",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3
  } as GeolocationPositionError
}

function position(timestamp = 1_000): GeolocationPosition {
  return {
    coords: {
      longitude: -76.88,
      latitude: 40.27,
      speed: 8,
      altitude: 120,
      heading: 90,
      accuracy: 7,
      altitudeAccuracy: null
    },
    timestamp
  } as GeolocationPosition
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
      error: "Location permission was denied. Enable precise location for OpenGravel and try again."
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

  it("finishes an immediate denial with zero samples without leaving recovery data", () => {
    deniedGeolocation()
    const { result } = renderHook(() => useRecordingSession())

    act(() => result.current.start())
    expect(result.current.state.status).toBe("denied")
    expect(result.current.state.points).toHaveLength(0)
    expect(localStorage.getItem("switchback:active-recording")).toContain('"status":"denied"')

    expect(() => act(() => result.current.finish())).not.toThrow()
    expect(result.current.state.status).toBe("finished")
    expect(result.current.state.points).toEqual([])
    expect(result.current.isActive).toBe(false)
    expect(localStorage.getItem("switchback:active-recording")).toBeNull()
  })

  it("discards an immediate denial and clears the recoverable session", () => {
    deniedGeolocation()
    const { result } = renderHook(() => useRecordingSession())

    act(() => result.current.start())
    expect(localStorage.getItem("switchback:active-recording")).not.toBeNull()

    act(() => result.current.discard())

    expect(result.current.state.status).toBe("idle")
    expect(result.current.state.startedAt).toBeNull()
    expect(result.current.state.points).toEqual([])
    expect(result.current.isActive).toBe(false)
    expect(localStorage.getItem("switchback:active-recording")).toBeNull()
  })

  it("retries GPS in the same denied session and records the next valid sample", () => {
    const { callbacks, watchPosition } = controlledGeolocation()
    const { result } = renderHook(() => useRecordingSession())

    act(() => result.current.start())
    const startedAt = result.current.state.startedAt
    expect(watchPosition).toHaveBeenCalledOnce()

    act(() => callbacks[0]!.success(position(900)))
    const firstPoint = result.current.state.points[0]
    expect(firstPoint).toBeDefined()

    act(() => callbacks[0]!.error(permissionError()))
    expect(result.current.state.status).toBe("denied")

    act(() => result.current.retryGps())
    expect(result.current.state.status).toBe("recording")
    expect(result.current.state.startedAt).toBe(startedAt)
    expect(watchPosition).toHaveBeenCalledTimes(2)

    act(() => callbacks[1]!.success(position()))

    expect(result.current.state.status).toBe("recording")
    expect(result.current.state.startedAt).toBe(startedAt)
    expect(result.current.state.points).toHaveLength(2)
    expect(result.current.state.points[0]).toEqual(firstPoint)
    expect(watchPosition).toHaveBeenCalledTimes(2)
  })

  it("recovers a denied session after reload with retry, finish, and discard available", async () => {
    const first = controlledGeolocation()
    const initial = renderHook(() => useRecordingSession())
    act(() => initial.result.current.start())
    act(() => first.callbacks[0]!.error(permissionError()))
    expect(localStorage.getItem("switchback:active-recording")).toContain('"status":"denied"')
    initial.unmount()

    const recovered = renderHook(() => useRecordingSession())
    await waitFor(() => expect(recovered.result.current.state.status).toBe("denied"))

    const controller = {
      ...recovered.result.current,
      retryGps: vi.fn(),
      finish: vi.fn(),
      discard: vi.fn()
    } as unknown as RecordingSessionController
    render(<RideRecordingHud controller={controller} />)

    expect(screen.getByRole("button", { name: "Try GPS again" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Finish & save" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Discard" })).toBeVisible()
  })

  it("recovers an error message after reload instead of silently clearing it", async () => {
    const geolocation = controlledGeolocation()
    const initial = renderHook(() => useRecordingSession())
    act(() => initial.result.current.start())
    act(() => geolocation.callbacks[0]!.error({
      code: 2,
      message: "Position unavailable",
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3
    } as GeolocationPositionError))
    const stored = localStorage.getItem("switchback:active-recording")
    expect(stored).toContain('"status":"error"')
    expect(stored).toContain("GPS is not ready")
    initial.unmount()

    const recovered = renderHook(() => useRecordingSession())
    await waitFor(() => expect(recovered.result.current.state.status).toBe("error"))

    expect(recovered.result.current.state.error).toBe("GPS is not ready: Position unavailable")
    expect(recovered.result.current.isActive).toBe(true)

    render(
      <RideRecordingHud
        controller={{
          ...recovered.result.current,
          retryGps: vi.fn(),
          finish: vi.fn(),
          discard: vi.fn()
        } as unknown as RecordingSessionController}
      />
    )
    expect(screen.getByRole("button", { name: "Try GPS again" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Finish & save" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Discard" })).toBeVisible()
  })

  it("persists and recovers Free Ride identity through an immediate denial", async () => {
    deniedGeolocation()
    const initial = renderHook(() => useRecordingSession())

    act(() => initial.result.current.start("free-ride"))

    expect(initial.result.current.state.kind).toBe("free-ride")
    expect(localStorage.getItem("switchback:active-recording")).toContain('"kind":"free-ride"')
    initial.unmount()

    const recovered = renderHook(() => useRecordingSession())
    await waitFor(() => expect(recovered.result.current.state.status).toBe("denied"))

    expect(recovered.result.current.state.kind).toBe("free-ride")
    expect(recovered.result.current.isActive).toBe(true)
  })
})
