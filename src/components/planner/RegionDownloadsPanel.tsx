"use client"

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import {
  ArrowDown,
  CloudArrowDown,
  Trash,
  Warning,
  CheckCircle,
  SpinnerGap,
  Info,
  Database
} from "@phosphor-icons/react"
import {
  OFFLINE_REGIONS,
  formatRegionBytes,
  suggestRegionsForRoute,
  type OfflineRegion
} from "@/lib/offline/region-catalog"
import { RegionDownloadClient, type RegionDownloadStatus } from "@/lib/storage/region-download-client"
import type { Coordinate } from "@/lib/routing/types"

interface DownloadedRegion {
  id: string
  builtAt: string
  downloadedAt: string
}

interface RegionUIState {
  status: RegionDownloadStatus
  progress: number
  error: string | null
}

interface RegionStateMap {
  [regionId: string]: RegionUIState
}

type DownloadAction =
  | { type: "set_downloading"; regionId: string }
  | { type: "set_progress"; regionId: string; progress: number }
  | { type: "set_ready"; regionId: string }
  | { type: "set_error"; regionId: string; error: string }
  | { type: "set_stale"; regionId: string }
  | { type: "set_removed"; regionId: string }
  | { type: "hydrate"; states: RegionStateMap; downloaded: DownloadedRegion[] }

function downloadReducer(state: { regionStates: RegionStateMap; downloadedIds: Set<string> }, action: DownloadAction): typeof state {
  switch (action.type) {
    case "set_downloading":
      return {
        regionStates: { ...state.regionStates, [action.regionId]: { status: "downloading", progress: 0, error: null } },
        downloadedIds: state.downloadedIds
      }
    case "set_progress":
      return {
        regionStates: {
          ...state.regionStates,
          [action.regionId]: { ...(state.regionStates[action.regionId] ?? { status: "downloading", progress: 0, error: null }), progress: action.progress }
        },
        downloadedIds: state.downloadedIds
      }
    case "set_ready":
      return {
        regionStates: { ...state.regionStates, [action.regionId]: { status: "ready", progress: 1, error: null } },
        downloadedIds: new Set(state.downloadedIds).add(action.regionId)
      }
    case "set_error":
      return {
        regionStates: { ...state.regionStates, [action.regionId]: { status: "failed", progress: 0, error: action.error } },
        downloadedIds: state.downloadedIds
      }
    case "set_stale":
      return {
        regionStates: { ...state.regionStates, [action.regionId]: { status: "stale", progress: 1, error: null } },
        downloadedIds: state.downloadedIds
      }
    case "set_removed":
      return {
        regionStates: { ...state.regionStates, [action.regionId]: { status: "not-downloaded", progress: 0, error: null } },
        downloadedIds: new Set([...state.downloadedIds].filter(id => id !== action.regionId))
      }
    case "hydrate":
      return { regionStates: action.states, downloadedIds: new Set(action.downloaded.map(d => d.id)) }
    default:
      return state
  }
}

export interface RegionDownloadsPanelProps {
  activeWaypoints: Coordinate[]
  onRegionDownloaded?(regionId: string): void
}

export interface RegionDownloadsHandle {
  refresh(): Promise<void>
  getRegions(): string[]
}

export function RegionDownloadsPanel({
  activeWaypoints,
  onRegionDownloaded
}: RegionDownloadsPanelProps) {
  const [state, dispatch] = useReducer(downloadReducer, { regionStates: {}, downloadedIds: new Set<string>() })
  const clientRef = useRef<RegionDownloadClient | null>(null)
  const downloadedListRef = useRef<DownloadedRegion[]>([])

  if (clientRef.current == null) {
    clientRef.current = new RegionDownloadClient()
  }

  const refresh = useCallback(async () => {
    const client = clientRef.current!
    const downloaded = await client.list()
    downloadedListRef.current = downloaded

    const states: RegionStateMap = {}
    for (const region of OFFLINE_REGIONS) {
      const entry = downloaded.find(d => d.id === region.id)
      if (!entry) {
        states[region.id] = { status: "not-downloaded", progress: 0, error: null }
        continue
      }
      const ageMs = Date.now() - Date.parse(entry.downloadedAt)
      const stale = ageMs > 1000 * 60 * 60 * 24 * 7
      states[region.id] = stale
        ? { status: "stale", progress: 1, error: null }
        : { status: "ready", progress: 1, error: null }
    }
    dispatch({ type: "hydrate", states, downloaded })
  }, [])

  useEffect(() => {
    queueMicrotask(() => { void refresh() })
  }, [refresh])

  const downloadRegion = useCallback(async (region: OfflineRegion) => {
    const client = clientRef.current!
    dispatch({ type: "set_downloading", regionId: region.id })
    try {
      await client.download(region, (progress) => {
        dispatch({ type: "set_progress", regionId: region.id, progress })
      })
      dispatch({ type: "set_ready", regionId: region.id })
      onRegionDownloaded?.(region.id)
    } catch (err) {
      dispatch({
        type: "set_error",
        regionId: region.id,
        error: err instanceof Error ? err.message : "Download failed"
      })
    }
  }, [onRegionDownloaded])

  const removeRegion = useCallback(async (regionId: string) => {
    await clientRef.current!.remove(regionId)
    dispatch({ type: "set_removed", regionId })
  }, [])

  const suggested = suggestRegionsForRoute(activeWaypoints)

  const statusIcon = (rs: RegionUIState) => {
    switch (rs.status) {
      case "downloading": return <SpinnerGap className="region-icon region-icon-spin" weight="bold" aria-hidden="true" />
      case "ready": return <CheckCircle className="region-icon region-icon-ready" weight="fill" aria-hidden="true" />
      case "stale": return <Warning className="region-icon region-icon-stale" weight="fill" aria-hidden="true" />
      case "failed": return <Warning className="region-icon region-icon-error" weight="fill" aria-hidden="true" />
      case "expired": return <Warning className="region-icon region-icon-error" weight="fill" aria-hidden="true" />
      default: return <CloudArrowDown className="region-icon" aria-hidden="true" />
    }
  }

  const statusLabel = (rs: RegionUIState): string => {
    switch (rs.status) {
      case "downloading": return `Downloading… ${Math.round(rs.progress * 100)}%`
      case "ready": return "Ready"
      case "stale": return "Update available"
      case "failed": return rs.error ?? "Download failed"
      case "expired": return "Expired"
      default: return "Download"
    }
  }

  return (
    <div className="region-downloads-panel">
      <h3 className="region-heading">
        <Database aria-hidden="true" weight="regular" />
        {" "}Offline Map Data
      </h3>
      <p className="region-description">
        Download regional map tiles to your device for routing when you have no signal.
        Data sourced from{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>{" "}
        via Geofabrik.
      </p>

      {suggested.length > 0 && activeWaypoints.length > 0 && (
        <div className="region-suggested">
          <p className="region-suggested-label">
            <Info aria-hidden="true" weight="fill" /> Suggested for your route:
          </p>
          <div className="region-suggested-list">
            {suggested.map(r => (
              <span key={r.id} className="region-suggested-chip">{r.code}</span>
            ))}
          </div>
        </div>
      )}

      <ul className="region-list">
        {OFFLINE_REGIONS.map(region => {
          const rs = state.regionStates[region.id]
          if (!rs) return null

          const isSuggested = suggested.some(s => s.id === region.id)
          const hasProgress = rs.status === "downloading" && rs.progress > 0

          return (
            <li key={region.id} className={`region-item ${isSuggested ? "region-item-suggested" : ""}`}>
              <div className="region-item-info">
                <span className="region-item-name">{region.name}</span>
                <span className="region-item-meta">
                  {formatRegionBytes(region.estimatedDownloadBytes)} • {region.estimatedNodeCount.toLocaleString()} nodes
                </span>
                <span className="region-item-meta">
                  Map data as of {region.dataDate.slice(0, 10)}
                </span>
                {hasProgress && (
                  <progress className="region-progress" value={rs.progress} max={1} aria-label={`Download progress for ${region.name}`} />
                )}
              </div>
              <div className="region-item-actions">
                {rs.status === "not-downloaded" || rs.status === "failed" || rs.status === "expired" ? (
                  <button
                    type="button"
                    className="region-download-btn"
                    onClick={() => downloadRegion(region)}
                    aria-label={`Download offline data for ${region.name}`}
                  >
                    {statusIcon(rs)}
                    <span>{statusLabel(rs)}</span>
                  </button>
                ) : rs.status === "downloading" ? (
                  <button
                    type="button"
                    className="region-cancel-btn"
                    onClick={() => clientRef.current?.cancel(region.id)}
                    aria-label={`Cancel download for ${region.name}`}
                  >
                    Cancel
                  </button>
                ) : (
                  <>
                    <span className="region-status-badge">
                      {statusIcon(rs)}
                      <span>{statusLabel(rs)}</span>
                    </span>
                    <button
                      type="button"
                      className="region-remove-btn"
                      onClick={() => removeRegion(region.id)}
                      aria-label={`Remove offline data for ${region.name}`}
                    >
                      <Trash aria-hidden="true" weight="regular" />
                    </button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="region-footer">
        <StorageQuota clientRef={clientRef} />
      </div>
    </div>
  )
}

interface StorageQuotaProps {
  clientRef: React.RefObject<RegionDownloadClient | null>
}

function StorageQuota({ clientRef }: StorageQuotaProps) {
  const [totalBytes, setTotalBytes] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void clientRef.current?.getTotalBytes().then(b => {
      if (!cancelled) setTotalBytes(b)
    })
    return () => { cancelled = true }
  }, [clientRef])

  void totalBytes

  if (totalBytes === null) return null
  return (
    <p className="region-quota">
      <ArrowDown aria-hidden="true" weight="regular" />
      {" "}Total offline data: {formatRegionBytes(totalBytes)}
    </p>
  )
}
