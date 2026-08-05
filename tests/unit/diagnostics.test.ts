import { describe, expect, it } from "vitest"
import { providerLabel, summarizeStorage, type StorageDiagnostics } from "@/lib/domain/diagnostics"
import { computeOfflineReadiness } from "@/lib/offline/readiness"

const baseStorage: StorageDiagnostics = {
  persistentStorageGranted: false,
  estimatedUsageBytes: 52_428_800,
  quotaBytes: 1_073_741_824,
  regionCount: 1,
  routeCount: 3,
  tripCount: 2,
  preferenceCount: 1
}

describe("diagnostics (SB-028)", () => {
  it("summarizes storage usage honestly including persistence state", () => {
    const text = summarizeStorage(baseStorage)
    expect(text).toContain("50.0 MB")
    expect(text).toContain("storage is not persistent")
    expect(summarizeStorage({ ...baseStorage, persistentStorageGranted: true })).toContain("persistent storage granted")
    expect(summarizeStorage({ ...baseStorage, estimatedUsageBytes: null })).toContain("not measurable")
  })

  it("labels provider status without inventing health", () => {
    expect(providerLabel("healthy")).toBe("healthy")
    expect(providerLabel("unreachable")).toBe("unreachable")
    expect(providerLabel("not-configured")).toBe("not configured")
  })

  it("surfaces readiness warnings into the snapshot", () => {
    const readiness = computeOfflineReadiness({
      serviceWorkerRegistered: false,
      hasSavedRoutes: true,
      installedRegions: [],
      mapTilesPresent: false
    })
    expect(readiness.warnings.length).toBeGreaterThan(0)
    expect(readiness.shell).toBe("not-ready")
  })
})
