import { renderHook, waitFor, act } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useRecordingSession } from "@/components/shell/useRecordingSession"
import { recordingTelemetry } from "@/lib/client/recording-session"

const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation")

function installGeolocation() {
  const watchPosition = vi.fn(() => 42)
  const clearWatch = vi.fn()
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition, clearWatch }
  })
  return { watchPosition, clearWatch }
}

describe("useRecordingSession", () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.restoreAllMocks()
    if (originalGeolocation) Object.defineProperty(navigator, "geolocation", originalGeolocation)
    else Reflect.deleteProperty(navigator, "geolocation")
  })

  it("starts the GPS watcher and records altitude, heading, and accuracy samples", () => {
    const { watchPosition } = installGeolocation()
    const { result } = renderHook(() => useRecordingSession())

    act(() => result.current.start())

    expect(watchPosition).toHaveBeenCalledOnce()
    const [onSuccess, , options] = watchPosition.mock.calls[0] as unknown as [PositionCallback, PositionErrorCallback | null, PositionOptions]
    expect(options).toMatchObject({ enableHighAccuracy: true, maximumAge: 1_000, timeout: 12_000 })

    act(() => {
      onSuccess({
        coords: {
          longitude: -76.8867,
          latitude: 40.2732,
          speed: 22.35,
          altitude: 122.4,
          heading: 45,
          accuracy: 8,
          altitudeAccuracy: null
        },
        timestamp: Date.now()
      } as GeolocationPosition)
    })

    expect(result.current.state.status).toBe("recording")
    expect(result.current.state.points).toHaveLength(1)
    const point = result.current.state.points[0]!
    expect(point.speedMph).toBeCloseTo(50, 0)
    expect(point.altitudeMeters).toBeCloseTo(122.4)
    expect(point.headingDegrees).toBe(45)
    expect(point.accuracyMeters).toBe(8)
  })

  it("pauses by clearing the watcher and persists an interrupted session for recovery", () => {
    const { clearWatch } = installGeolocation()
    const { result } = renderHook(() => useRecordingSession())

    act(() => result.current.start())
    act(() => result.current.pause())

    expect(clearWatch).toHaveBeenCalledWith(42)
    expect(result.current.state.status).toBe("paused")
    expect(localStorage.getItem("switchback:active-recording")).toContain('"status":"paused"')

    // A new mount recovers the interrupted session so the app can reopen
    // straight into riding mode.
    const recovered = renderHook(() => useRecordingSession())
    expect(recovered.result.current.state.status).toBe("paused")
    expect(recovered.result.current.isActive).toBe(true)
  })

  it("finishing keeps the captured points for saving", () => {
    installGeolocation()
    const { result } = renderHook(() => useRecordingSession())

    act(() => result.current.start())
    act(() => result.current.finish())

    expect(result.current.state.status).toBe("finished")
    expect(result.current.isActive).toBe(false)
    expect(localStorage.getItem("switchback:active-recording")).toBeNull()
    void waitFor(() => undefined)
  })

  it("computes live telemetry: distance, ascent, descent, avg/max speed", () => {
    installGeolocation()
    const { result } = renderHook(() => useRecordingSession())

    act(() => result.current.start())
    const { watchPosition } = navigator.geolocation as unknown as { watchPosition: ReturnType<typeof vi.fn> }
    const onSuccess = (watchPosition.mock.calls[0] as unknown[])[0] as PositionCallback
    const sample = (lon: number, lat: number, altitude: number, speed: number) =>
      onSuccess({
        coords: {
          longitude: lon,
          latitude: lat,
          speed,
          altitude,
          heading: 0,
          accuracy: 6,
          altitudeAccuracy: null
        },
        timestamp: Date.now()
      } as GeolocationPosition)

    act(() => {
      sample(-76.8867, 40.2732, 100, 10)
      sample(-76.8857, 40.2735, 120, 12)
      sample(-76.8847, 40.2738, 90, 14)
    })

    const telemetry = recordingTelemetry(result.current.state, Date.now())
    expect(telemetry.distanceMiles).toBeGreaterThan(0)
    expect(telemetry.ascentMeters).toBeCloseTo(20)
    expect(telemetry.descentMeters).toBeCloseTo(30)
    // Sample speeds are m/s; the hook converts to mph.
    expect(telemetry.maxSpeedMph).toBeCloseTo(14 * 2.236936)
    expect(telemetry.averageSpeedMph).toBeCloseTo(12 * 2.236936)
  })
})
