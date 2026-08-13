import { afterEach, describe, expect, it } from "vitest"
import {
  collectRuntimeDiagnostics,
  readTrackedRuntimeDiagnostics,
  setGeoWorkerRuntimeMetrics,
  setMapRuntimeProbe,
  setRouteRuntimeMetrics,
  trackRuntimeResource
} from "@/lib/client/runtime-diagnostics"

describe("runtime diagnostics", () => {
  const releases: Array<() => void> = []

  afterEach(() => {
    for (const release of releases.splice(0)) release()
    setMapRuntimeProbe(null)
    setRouteRuntimeMetrics(null)
    setGeoWorkerRuntimeMetrics(null)
  })

  it("reports tracked resources and live map/route metrics", () => {
    releases.push(trackRuntimeResource("timer"))
    releases.push(trackRuntimeResource("gps-watch"))
    releases.push(trackRuntimeResource("worker"))
    setRouteRuntimeMetrics({ entityCount: 2, geometryBytesEstimate: 32 })
    setGeoWorkerRuntimeMetrics({ loadedTiles: 4, bytes: 4096 })
    setMapRuntimeProbe(() => ({ sourceCount: 3, layerCount: 7 }))

    expect(readTrackedRuntimeDiagnostics()).toMatchObject({
      timerCount: 1,
      gpsWatchCount: 1,
      workerCount: 1,
      routeEntityCount: 2,
      routeGeometryBytesEstimate: 32,
      mapSourceCount: 3,
      mapLayerCount: 7,
      geoWorkerLoadedTiles: 4,
      geoWorkerBytes: 4096
    })

    releases.pop()?.()
    expect(readTrackedRuntimeDiagnostics().workerCount).toBe(0)
  })

  it("leaves browser-only values measurable rather than fabricated", async () => {
    const snapshot = await collectRuntimeDiagnostics()

    expect(snapshot.timerCount).toBe(0)
    expect(snapshot.gpsWatchCount).toBe(0)
    expect(snapshot.workerCount).toBe(0)
    expect(snapshot.jsHeapUsedBytes).toBeNull()
    expect(snapshot.cacheEntryCount).toBeNull()
  })
})
