/** Storage thresholds the lead decision mandates. */
export const STORAGE_QUOTA_THRESHOLDS = Object.freeze({
  /** Below this fraction of reported quota: normal behaviour. */
  warnFraction: 0.7,
  /** Above this fraction of reported quota: strong warning. */
  strongWarnFraction: 0.85,
  /** Always keep at least this many bytes free when projecting a download. */
  reserveBytes: 500 * 1024 * 1024
})

export type StorageQuotaTier = "normal" | "warn" | "strong-warn" | "block"

export interface StorageQuotaSnapshot {
  usageBytes: number
  quotaBytes: number
  /** True when `navigator.storage.persist()` was granted durable storage. */
  persistent: boolean
  /** Bytes the browser reported remaining. */
  remainingBytes: number
  tier: StorageQuotaTier
  /** Fraction of quota currently in use, in [0, 1]. */
  usageFraction: number
}

export interface StorageQuotaProjection {
  snapshot: StorageQuotaSnapshot
  /** Bytes the new package would add. */
  projectedAddBytes: number
  /** Bytes used after install. */
  projectedUsageBytes: number
  /** Tier at the projected usage. */
  projectedTier: StorageQuotaTier
  /** True when the download should be permitted under policy. */
  permitted: boolean
  /** Why the download was blocked, if it was. */
  reason: string | null
}

/**
 * Read the browser's storage estimate and persistence state without
 * throwing. Browsers may not grant durable persistence, may not expose
 * `navigator.storage`, and may report a quota of 0 in private mode; in
 * each case we degrade to a permissive tier rather than blocking.
 */
export async function readStorageQuotaSnapshot(): Promise<StorageQuotaSnapshot> {
  const fallback: StorageQuotaSnapshot = {
    usageBytes: 0,
    quotaBytes: 0,
    persistent: false,
    remainingBytes: 0,
    tier: "normal",
    usageFraction: 0
  }
  const nav = globalThis.navigator as Navigator & {
    storage?: {
      estimate?: () => Promise<{ usage?: number; quota?: number }>
      persist?: () => Promise<boolean>
      persisted?: () => Promise<boolean>
    }
  }
  if (!nav?.storage?.estimate) return fallback
  let estimate: { usage?: number; quota?: number } = {}
  try {
    estimate = await nav.storage.estimate()
  } catch {
    return fallback
  }
  const usageBytes = Math.max(0, Math.floor(estimate.usage ?? 0))
  const quotaBytes = Math.max(0, Math.floor(estimate.quota ?? 0))
  let persistent = false
  try {
    persistent = nav.storage.persisted ? await nav.storage.persisted() : false
  } catch {
    persistent = false
  }
  const remainingBytes = Math.max(0, quotaBytes - usageBytes)
  const usageFraction = quotaBytes > 0 ? usageBytes / quotaBytes : 0
  return {
    usageBytes,
    quotaBytes,
    persistent,
    remainingBytes,
    usageFraction,
    tier: classifyQuotaTier(usageBytes, quotaBytes)
  }
}

/** Ask the browser for more durable storage; may be denied. */
export async function requestPersistentStorage(): Promise<boolean> {
  const nav = globalThis.navigator as Navigator & {
    storage?: { persist?: () => Promise<boolean> }
  }
  if (!nav?.storage?.persist) return false
  try {
    return await nav.storage.persist()
  } catch {
    return false
  }
}

/**
 * Classify a (usage, quota) pair into the policy tier. The 70/85%
 * thresholds are surfaced to the rider; the block tier triggers only
 * when a specific pending download would overflow quota or breach the
 * minimum reserve — the rider's existing data is never wiped.
 */
export function classifyQuotaTier(usageBytes: number, quotaBytes: number): StorageQuotaTier {
  if (quotaBytes <= 0) return "normal"
  const fraction = usageBytes / quotaBytes
  if (fraction >= STORAGE_QUOTA_THRESHOLDS.strongWarnFraction) return "strong-warn"
  if (fraction >= STORAGE_QUOTA_THRESHOLDS.warnFraction) return "warn"
  return "normal"
}

/**
 * Project whether installing a new package of `packageBytes` is permitted
 * under the storage policy. Downloads are blocked only when the package
 * would exceed the reported quota or leave less than the minimum
 * reserve; age-based staleness never blocks routing.
 */
export function projectStorageQuota(
  snapshot: StorageQuotaSnapshot,
  packageBytes: number
): StorageQuotaProjection {
  const projectedAddBytes = Math.max(0, Math.floor(packageBytes))
  const projectedUsageBytes = snapshot.usageBytes + projectedAddBytes
  const projectedTier = classifyQuotaTier(projectedUsageBytes, snapshot.quotaBytes)
  if (snapshot.quotaBytes <= 0) {
    return {
      snapshot,
      projectedAddBytes,
      projectedUsageBytes,
      projectedTier,
      permitted: true,
      reason: null
    }
  }
  if (projectedUsageBytes > snapshot.quotaBytes) {
    return {
      snapshot,
      projectedAddBytes,
      projectedUsageBytes,
      projectedTier,
      permitted: false,
      reason: "Installing this package would exceed the browser-reported storage quota."
    }
  }
  if (snapshot.quotaBytes - projectedUsageBytes < STORAGE_QUOTA_THRESHOLDS.reserveBytes) {
    return {
      snapshot,
      projectedAddBytes,
      projectedUsageBytes,
      projectedTier,
      permitted: false,
      reason: `Install would leave less than ${Math.round(STORAGE_QUOTA_THRESHOLDS.reserveBytes / (1024 * 1024))} MB free.`
    }
  }
  return {
    snapshot,
    projectedAddBytes,
    projectedUsageBytes,
    projectedTier,
    permitted: true,
    reason: null
  }
}

/** Convenience: estimate how many packages of equal size still fit. */
export function packagesRemaining(snapshot: StorageQuotaSnapshot, packageBytes: number): number {
  if (packageBytes <= 0 || snapshot.quotaBytes <= 0) return Number.POSITIVE_INFINITY
  const remainingAfterReserve = Math.max(0, snapshot.quotaBytes - snapshot.usageBytes - STORAGE_QUOTA_THRESHOLDS.reserveBytes)
  return Math.floor(remainingAfterReserve / packageBytes)
}
