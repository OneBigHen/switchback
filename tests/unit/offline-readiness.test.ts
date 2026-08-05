import { describe, expect, it } from "vitest"
import { computeOfflineReadiness, offlineLevelLabel } from "@/lib/offline/readiness"

describe("offline readiness (SB-020)", () => {
  it("reports level 3 when a routing graph region is installed", () => {
    const readiness = computeOfflineReadiness({
      serviceWorkerRegistered: true,
      hasSavedRoutes: true,
      installedRegions: [{
        regionId: "pa", code: "PA", builtAt: "2026-08-01T00:00:00.000Z", stale: false, hasRoutingGraph: true
      }],
      mapTilesPresent: true
    })
    expect(readiness).toMatchObject({ shell: "ready", route: "ready", routing: "ready", mapTiles: "ready" })
    expect(readiness.warnings).toEqual([])
    expect(offlineLevelLabel(readiness)).toBe("Level 3 — offline routing")
  })

  it("reports level 1 with an honest partial routing when only shell is ready", () => {
    const readiness = computeOfflineReadiness({
      serviceWorkerRegistered: true,
      hasSavedRoutes: false,
      installedRegions: [],
      mapTilesPresent: false
    })
    expect(readiness).toMatchObject({ shell: "ready", route: "not-ready", routing: "not-ready", mapTiles: "partial" })
    expect(offlineLevelLabel(readiness)).toBe("Level 1 — offline shell")
  })

  it("warns when a region has tiles but no routing graph", () => {
    const readiness = computeOfflineReadiness({
      serviceWorkerRegistered: true,
      hasSavedRoutes: true,
      installedRegions: [{
        regionId: "nj", code: "NJ", builtAt: "2026-08-01T00:00:00.000Z", stale: false, hasRoutingGraph: false
      }],
      mapTilesPresent: true
    })
    expect(readiness.routing).toBe("partial")
    expect(readiness.regions[0]?.status).toBe("partial")
    expect(readiness.warnings.some((warning) => warning.includes("no offline routing graph"))).toBe(true)
  })

  it("never claims readiness without a service worker", () => {
    const readiness = computeOfflineReadiness({
      serviceWorkerRegistered: false,
      hasSavedRoutes: true,
      installedRegions: [{ regionId: "pa", code: "PA", builtAt: null, stale: false, hasRoutingGraph: true }],
      mapTilesPresent: true
    })
    expect(readiness.shell).toBe("not-ready")
    expect(readiness.warnings.some((warning) => warning.includes("service worker"))).toBe(true)
  })
})
