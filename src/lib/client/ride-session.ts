import { trackRuntimeResource } from "@/lib/client/runtime-diagnostics"

export interface WakeLockHandle {
  release(): Promise<void>
}

export interface RideEnvironment {
  watchPosition(
    onPosition: PositionCallback,
    onError: PositionErrorCallback,
    options?: PositionOptions
  ): number
  clearWatch(watchId: number): void
  requestWakeLock?: () => Promise<WakeLockHandle>
}

export interface RideSessionOptions {
  onPosition: PositionCallback
  onError: PositionErrorCallback
  environment?: RideEnvironment
}

export interface RideSession {
  stop(): Promise<void>
}

function browserEnvironment(): RideEnvironment {
  const geolocation = navigator.geolocation
  const wakeLockNavigator = navigator as Navigator & {
    wakeLock?: { request(type: "screen"): Promise<WakeLockHandle> }
  }
  return {
    watchPosition: geolocation.watchPosition.bind(geolocation),
    clearWatch: geolocation.clearWatch.bind(geolocation),
    requestWakeLock: wakeLockNavigator.wakeLock
      ? () => wakeLockNavigator.wakeLock!.request("screen")
      : undefined
  }
}

export async function startRideSession(options: RideSessionOptions): Promise<RideSession> {
  const environment = options.environment ?? browserEnvironment()
  const watchId = environment.watchPosition(options.onPosition, options.onError, {
    enableHighAccuracy: true,
    maximumAge: 1_000,
    timeout: 12_000
  })
  const releaseGpsWatchMetric = trackRuntimeResource("gps-watch")

  let wakeLock: WakeLockHandle | undefined
  try {
    wakeLock = await environment.requestWakeLock?.()
  } catch {
    wakeLock = undefined
  }

  let stopped = false
  return {
    async stop() {
      if (stopped) return
      stopped = true
      environment.clearWatch(watchId)
      releaseGpsWatchMetric()
      await wakeLock?.release()
    }
  }
}
