"use client"

import { useEffect, useState } from "react"
import { ArrowDown, Database, HardDrives, Lock, Warning } from "@phosphor-icons/react"
import { formatRegionBytes } from "@/lib/offline/region-catalog"
import {
  packagesRemaining as packagesRemainingFor,
  projectStorageQuota,
  readStorageQuotaSnapshot,
  requestPersistentStorage,
  type StorageQuotaProjection,
  type StorageQuotaSnapshot,
  type StorageQuotaTier
} from "@/lib/offline/storage-quota"

export interface StorageQuotaMeterProps {
  /** Total bytes already installed on this device (from RegionDownloadClient.getTotalBytes). */
  installedBytes: number
  /** Bytes the pending download would add. Pass 0 (or null) when nothing is queued. */
  pendingPackageBytes: number | null
  onPersistentChange?(persistent: boolean): void
  onProjectionChange?(projection: StorageQuotaProjection | null): void
}

const TIER_LABEL: Record<StorageQuotaTier, string> = {
  normal: "Healthy",
  warn: "High use",
  "strong-warn": "Near limit",
  block: "Blocked"
}

export function StorageQuotaMeter({
  installedBytes,
  pendingPackageBytes,
  onPersistentChange,
  onProjectionChange
}: StorageQuotaMeterProps) {
  const [snapshot, setSnapshot] = useState<StorageQuotaSnapshot | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void readStorageQuotaSnapshot().then((next) => {
      if (!cancelled) setSnapshot(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const packageBytes = pendingPackageBytes ?? 0
  const projection: StorageQuotaProjection | null = snapshot
    ? projectStorageQuota(snapshot, packageBytes)
    : null

  useEffect(() => {
    onProjectionChange?.(projection)
  }, [projection, onProjectionChange])

  const handleRequestPersistent = async () => {
    setRequesting(true)
    setRequestError(null)
    try {
      const granted = await requestPersistentStorage()
      if (!granted) {
        setRequestError("Browser denied persistent storage.")
      }
      const next = await readStorageQuotaSnapshot()
      setSnapshot(next)
      onPersistentChange?.(next.persistent)
    } catch {
      setRequestError("Could not request persistent storage.")
    } finally {
      setRequesting(false)
    }
  }

  if (!snapshot) {
    return (
      <div className="storage-quota-meter" aria-busy="true" aria-live="polite">
        <p className="storage-quota-meter-disclaimer">Reading storage usage…</p>
      </div>
    )
  }

  const usageFraction = snapshot.usageFraction
  const visibleFraction = Math.min(1, Math.max(0, usageFraction))
  const remainingPackages = packageBytes > 0 ? packagesRemainingFor(snapshot, packageBytes) : Number.POSITIVE_INFINITY
  const blocked = projection?.permitted === false

  return (
    <div className="storage-quota-meter" role="group" aria-label="Offline storage usage">
      <div className="storage-quota-meter-tier-row">
        <span className="storage-quota-meter-tier" data-tier={snapshot.tier}>
          <HardDrives aria-hidden="true" weight="bold" />
          {TIER_LABEL[snapshot.tier]}
        </span>
        <span className="storage-quota-meter-packages">
          <strong>{remainingPackages === Number.POSITIVE_INFINITY ? "—" : remainingPackages}</strong>{" "}
          pkg{remainingPackages === 1 ? "" : "s"} fit
        </span>
      </div>

      <div
        className="storage-quota-meter-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(visibleFraction * 100)}
        aria-label="Storage in use"
      >
        <span
          className="storage-quota-meter-bar-fill"
          data-tier={snapshot.tier}
          style={{ width: `${Math.round(visibleFraction * 100)}%` }}
        />
      </div>

      <div className="storage-quota-meter-row">
        <span>Current usage</span>
        <strong>{formatRegionBytes(snapshot.usageBytes)} / {formatRegionBytes(snapshot.quotaBytes)}</strong>
      </div>
      <div className="storage-quota-meter-row">
        <span>Available quota</span>
        <strong>{formatRegionBytes(snapshot.remainingBytes)}</strong>
      </div>
      <div className="storage-quota-meter-row">
        <span><Database aria-hidden="true" weight="regular" /> Installed offline data</span>
        <strong>{formatRegionBytes(installedBytes)}</strong>
      </div>

      {projection && packageBytes > 0 && (
        <div className="storage-quota-meter-projection" data-blocked={blocked ? "true" : "false"}>
          <span className="storage-quota-meter-projection-label">
            <ArrowDown aria-hidden="true" weight="bold" /> Projected after install
          </span>
          <span className="storage-quota-meter-projection-usage">
            {formatRegionBytes(projection.projectedUsageBytes)} ({Math.round(projection.projectedUsageBytes / Math.max(1, snapshot.quotaBytes) * 100)}%)
          </span>
          {blocked ? (
            <span className="storage-quota-meter-projection-reason">
              <Warning aria-hidden="true" weight="fill" /> {projection.reason ?? "Download would exceed storage policy."}
            </span>
          ) : (
            <span className="storage-quota-meter-projection-allowed">
              Install fits within policy; existing data is never wiped.
            </span>
          )}
        </div>
      )}

      <div className="storage-quota-meter-persist" data-persistent={snapshot.persistent ? "true" : "false"}>
        <Lock aria-hidden="true" weight={snapshot.persistent ? "fill" : "regular"} />
        <span>
          {snapshot.persistent
            ? "Persistent storage granted — the browser will try not to evict offline maps."
            : "Browser-stored data is not guaranteed permanent; saved-route packs remain recoverable from the server."}
        </span>
        {!snapshot.persistent && (
          <button
            type="button"
            className="storage-quota-meter-persist-cta"
            onClick={() => void handleRequestPersistent()}
            disabled={requesting}
            aria-label="Request durable storage so offline regions are less likely to be evicted"
          >
            {requesting ? "Requesting…" : "Request durable"}
          </button>
        )}
        {requestError && (
          <span className="storage-quota-meter-projection-reason" role="alert">{requestError}</span>
        )}
      </div>
    </div>
  )
}
