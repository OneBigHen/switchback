import { describe, expect, it, vi } from "vitest"
import { startRideSession } from "@/lib/client/ride-session"

describe("ride session browser resources", () => {
  it("acquires GPS and wake lock once, then releases both on stop", async () => {
    const release = vi.fn(async () => undefined)
    const clearWatch = vi.fn()
    const watchPosition = vi.fn(() => 42)
    const session = await startRideSession({
      onPosition: vi.fn(),
      onError: vi.fn(),
      environment: {
        watchPosition,
        clearWatch,
        requestWakeLock: vi.fn(async () => ({ release }))
      }
    })

    expect(watchPosition).toHaveBeenCalledOnce()
    await session.stop()
    await session.stop()

    expect(clearWatch).toHaveBeenCalledOnce()
    expect(clearWatch).toHaveBeenCalledWith(42)
    expect(release).toHaveBeenCalledOnce()
  })
})
