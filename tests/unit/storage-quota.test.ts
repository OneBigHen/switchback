import { describe, expect, it } from "vitest"
import {
  classifyQuotaTier,
  packagesRemaining,
  projectStorageQuota,
  readStorageQuotaSnapshot,
  requestPersistentStorage,
  STORAGE_QUOTA_THRESHOLDS,
  type StorageQuotaSnapshot
} from "@/lib/offline/storage-quota"

function snapshot(usage: number, quota: number, persistent = false): StorageQuotaSnapshot {
  const remainingBytes = Math.max(0, quota - usage)
  return {
    usageBytes: usage,
    quotaBytes: quota,
    persistent,
    remainingBytes,
    usageFraction: quota > 0 ? usage / quota : 0,
    tier: classifyQuotaTier(usage, quota)
  }
}

const GIGABYTE = 1024 * 1024 * 1024
const MEGABYTE = 1024 * 1024

describe("storage quota", () => {
  it("uses 70% warn, 85% strong-warn thresholds and a 500 MB reserve", () => {
    expect(STORAGE_QUOTA_THRESHOLDS.warnFraction).toBe(0.7)
    expect(STORAGE_QUOTA_THRESHOLDS.strongWarnFraction).toBe(0.85)
    expect(STORAGE_QUOTA_THRESHOLDS.reserveBytes).toBe(500 * MEGABYTE)
  })

  it("classifyQuotaTier reports normal below 70%", () => {
    expect(classifyQuotaTier(0.5 * GIGABYTE, 2 * GIGABYTE)).toBe("normal")
    expect(classifyQuotaTier(0.69 * GIGABYTE, 1 * GIGABYTE)).toBe("normal")
  })

  it("classifyQuotaTier reports warn above 70%", () => {
    expect(classifyQuotaTier(0.72 * GIGABYTE, 1 * GIGABYTE)).toBe("warn")
  })

  it("classifyQuotaTier reports strong-warn above 85%", () => {
    expect(classifyQuotaTier(0.9 * GIGABYTE, 1 * GIGABYTE)).toBe("strong-warn")
  })

  it("projectStorageQuota permits installs that leave >500 MB free", () => {
    const s = snapshot(0.1 * GIGABYTE, 2 * GIGABYTE)
    const projection = projectStorageQuota(s, 100 * MEGABYTE)
    expect(projection.permitted).toBe(true)
    expect(projection.projectedTier).toBe("normal")
  })

  it("projectStorageQuota blocks installs that would leave <500 MB free", () => {
    const s = snapshot(0.4 * GIGABYTE, 1 * GIGABYTE) // 600 MB free
    const projection = projectStorageQuota(s, 200 * MEGABYTE)
    expect(projection.permitted).toBe(false)
    expect(projection.reason).toContain("leave less than")
  })

  it("projectStorageQuota blocks installs that overflow quota outright", () => {
    const s = snapshot(0.9 * GIGABYTE, 1 * GIGABYTE) // 100 MB free
    const projection = projectStorageQuota(s, 200 * MEGABYTE)
    expect(projection.permitted).toBe(false)
    expect(projection.reason).toContain("exceed")
  })

  it("readStorageQuotaSnapshot returns a normal tier when navigator.storage is unavailable", async () => {
    const original = (globalThis as { navigator?: unknown }).navigator
    try {
      // Force the fallback path used in private mode or older browsers.
      Object.defineProperty(globalThis, "navigator", {
        value: undefined,
        configurable: true,
        writable: true
      })
      const result = await readStorageQuotaSnapshot()
      expect(result.tier).toBe("normal")
      expect(result.usageBytes).toBe(0)
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: original,
        configurable: true,
        writable: true
      })
    }
  })

  it("requestPersistentStorage resolves to false when storage API is unavailable", async () => {
    const original = (globalThis as { navigator?: unknown }).navigator
    try {
      Object.defineProperty(globalThis, "navigator", {
        value: undefined,
        configurable: true,
        writable: true
      })
      const result = await requestPersistentStorage()
      expect(result).toBe(false)
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        value: original,
        configurable: true,
        writable: true
      })
    }
  })

  it("packagesRemaining counts how many equal-sized packages still fit", () => {
    expect(packagesRemaining(snapshot(0.1 * GIGABYTE, 2 * GIGABYTE), 100 * MEGABYTE)).toBeGreaterThan(10)
    expect(packagesRemaining(snapshot(0.95 * GIGABYTE, 1 * GIGABYTE), 100 * MEGABYTE)).toBe(0)
  })
})
