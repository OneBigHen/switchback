"use client"

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import {
  ArrowClockwise,
  CloudArrowDown,
  Database,
  Info,
  SpinnerGap,
  Trash,
  Warning,
  CheckCircle,
  WifiHigh,
  ArrowsClockwise
} from "@phosphor-icons/react"
import {
  OFFLINE_REGIONS,
  formatRegionBytes,
  suggestRegionsForRoute,
  type OfflineRegion
} from "@/lib/offline/region-catalog"
import { RegionDownloadClient, type RegionDownloadStatus } from "@/lib/storage/region-download-client"
import type { Coordinate } from "@/lib/routing/types"
import { evaluateRegionStaleness, shouldPromptCorridorRebuild, type RegionStalenessTier } from "@/lib/offline/region-staleness"
import {
  HOME_TERRITORY_SUITE_ID,
  getRegionSuite,
  type RegionSuite
} from "@/lib/offline/region-suites"
import type { StorageQuotaProjection } from "@/lib/offline/storage-quota"
import { RegionSuitePicker } from "@/components/planner/RegionSuitePicker"
import { StorageQuotaMeter } from "@/components/planner/StorageQuotaMeter"
import {
  DOWNLOAD_MODE_PICKER_DEFAULT,
  DownloadModePicker,
  type DownloadModePickerValue
} from "@/components/planner/DownloadModePicker"
import { AriaLiveRegion } from "@/components/planner/a11y"

const DAILY_MANIFEST_CHECK_KEY = "switchback:region-manifest-last-check"
const LARGE_DOWNLOAD_BYTES = 100 * 1024 * 1024
const ONE_DAY_MS = 24 * 60 * 60 * 1000

interface DownloadedRegion {
  id: string
  builtAt: string
  downloadedAt: string
  bundleVersion: string
}

interface RegionUIState {
  status: RegionDownloadStatus
  progress: number
  error: string | null
  stalenessTier: RegionStalenessTier | null
  stalenessLabel: string | null
  stalenessGuidance: string | null
  bundleVersion: string | null
  builtAt: string | null
}

interface RegionStateMap {
  [regionId: string]: RegionUIState
}

type DownloadAction =
  | { type: "set_downloading"; regionId: string }
  | { type: "set_progress"; regionId: string; progress: number }
  | { type: "set_paused"; regionId: string }
  | { type: "set_ready"; regionId: string; builtAt: string; bundleVersion: string }
  | { type: "set_error"; regionId: string; error: string }
  | { type: "set_removed"; regionId: string }
  | { type: "hydrate"; states: RegionStateMap; downloaded: DownloadedRegion[] }

function downloadReducer(
  state: { regionStates: RegionStateMap; downloadedIds: Set<string> },
  action: DownloadAction
): typeof state {
  switch (action.type) {
    case "set_downloading":
      return {
        regionStates: { ...state.regionStates, [action.regionId]: { ...state.regionStates[action.regionId] ?? { status: "downloading", progress: 0, error: null, stalenessTier: null, stalenessLabel: null, stalenessGuidance: null, bundleVersion: null, builtAt: null }, status: "downloading", progress: 0, error: null } },
        downloadedIds: state.downloadedIds
      }
    case "set_progress": {
      const prev = state.regionStates[action.regionId] ?? { status: "downloading", progress: 0, error: null, stalenessTier: null, stalenessLabel: null, stalenessGuidance: null, bundleVersion: null, builtAt: null }
      return {
        regionStates: {
          ...state.regionStates,
          [action.regionId]: { ...prev, status: "downloading", progress: action.progress }
        },
        downloadedIds: state.downloadedIds
      }
    }
    case "set_paused": {
      const prev = state.regionStates[action.regionId]
      return {
        regionStates: {
          ...state.regionStates,
          [action.regionId]: {
            ...(prev ?? { progress: 0, error: null, stalenessTier: null, stalenessLabel: null, stalenessGuidance: null, bundleVersion: null, builtAt: null }),
            status: "paused",
            error: null
          }
        },
        downloadedIds: state.downloadedIds
      }
    }
    case "set_ready": {
      const staleness = evaluateRegionStaleness(action.builtAt)
      return {
        regionStates: {
          ...state.regionStates,
          [action.regionId]: {
            status: "ready",
            progress: 1,
            error: null,
            stalenessTier: staleness.tier,
            stalenessLabel: staleness.label,
            stalenessGuidance: staleness.guidance,
            bundleVersion: action.bundleVersion,
            builtAt: action.builtAt
          }
        },
        downloadedIds: new Set(state.downloadedIds).add(action.regionId)
      }
    }
    case "set_error":
      return {
        regionStates: {
          ...state.regionStates,
          [action.regionId]: { ...(state.regionStates[action.regionId] ?? { status: "failed", progress: 0, error: null, stalenessTier: null, stalenessLabel: null, stalenessGuidance: null, bundleVersion: null, builtAt: null }), status: "failed", progress: 0, error: action.error }
        },
        downloadedIds: state.downloadedIds
      }
    case "set_removed":
      return {
        regionStates: {
          ...state.regionStates,
          [action.regionId]: { status: "not-downloaded", progress: 0, error: null, stalenessTier: null, stalenessLabel: null, stalenessGuidance: null, bundleVersion: null, builtAt: null }
        },
        downloadedIds: new Set([...state.downloadedIds].filter((id) => id !== action.regionId))
      }
    case "hydrate":
      return { regionStates: action.states, downloadedIds: new Set(action.downloaded.map((d) => d.id)) }
    default:
      return state
  }
}

export interface RegionDownloadsPanelProps {
  activeWaypoints: Coordinate[]
  onRegionDownloaded?(regionId: string): void
  onDownloadModeChange?(value: DownloadModePickerValue): void
  onBuildCorridor?(route: { id: string; waypoints: { lat: number; lon: number }[] }): void
  pendingRoute?: { id: string; waypoints: { lat: number; lon: number }[] } | null
}

export interface RegionDownloadsHandle {
  refresh(): Promise<void>
  getRegions(): string[]
}

function buildRegionUIState(
  entry: DownloadedRegion | undefined,
  now: Date
): RegionUIState {
  if (!entry) {
    return {
      status: "not-downloaded",
      progress: 0,
      error: null,
      stalenessTier: null,
      stalenessLabel: null,
      stalenessGuidance: null,
      bundleVersion: null,
      builtAt: null
    }
  }
  const staleness = evaluateRegionStaleness(entry.builtAt, { now })
  return {
    status: "ready",
    progress: 1,
    error: null,
    stalenessTier: staleness.tier,
    stalenessLabel: staleness.label,
    stalenessGuidance: staleness.guidance,
    bundleVersion: entry.bundleVersion,
    builtAt: entry.builtAt
  }
}

function findCorridorRebuildCandidate(
  pendingRoute: { id: string; waypoints: { lat: number; lon: number }[] } | null,
  regionStates: RegionStateMap
): { region: OfflineRegion; route: { id: string; waypoints: { lat: number; lon: number }[] } } | null {
  if (!pendingRoute) return null
  for (const waypoint of pendingRoute.waypoints) {
    const containing = OFFLINE_REGIONS.filter((region) => {
      return (
        waypoint.lon >= region.bounds.minLon &&
        waypoint.lon <= region.bounds.maxLon &&
        waypoint.lat >= region.bounds.minLat &&
        waypoint.lat <= region.bounds.maxLat
      )
    })
    for (const region of containing) {
      const rs = regionStates[region.id]
      if (!rs || rs.status !== "ready" || !rs.bundleVersion || !rs.builtAt) continue
      const regionEntry = {
        corridorBundleVersion: "0",
        regionBundleVersion: rs.bundleVersion,
        withinDaysOfRide: 3
      }
      if (shouldPromptCorridorRebuild(regionEntry)) {
        return { region, route: pendingRoute }
      }
    }
  }
  return null
}

export function RegionDownloadsPanel({
  activeWaypoints,
  onRegionDownloaded,
  onDownloadModeChange,
  onBuildCorridor,
  pendingRoute = null
}: RegionDownloadsPanelProps) {
  const [state, dispatch] = useReducer(downloadReducer, {
    regionStates: {},
    downloadedIds: new Set<string>()
  })
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(HOME_TERRITORY_SUITE_ID)
  const [downloadMode, setDownloadMode] = useState<DownloadModePickerValue>(DOWNLOAD_MODE_PICKER_DEFAULT)
  const [installedBytes, setInstalledBytes] = useState(0)
  const [projection, setProjection] = useState<StorageQuotaProjection | null>(null)
  const [lastManifestCheck, setLastManifestCheck] = useState<Date | null>(null)
  const [largeDownloadPrompt, setLargeDownloadPrompt] = useState<{ region: OfflineRegion; bytes: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [updateAllRunning, setUpdateAllRunning] = useState(false)

  const clientRef = useRef<RegionDownloadClient | null>(null)
  if (clientRef.current == null) {
    clientRef.current = new RegionDownloadClient()
  }

  const selectedSuite: RegionSuite | null = useMemo(
    () => (selectedSuiteId ? getRegionSuite(selectedSuiteId) ?? null : null),
    [selectedSuiteId]
  )

  const suiteRegionCodes = useMemo(() => new Set(selectedSuite?.regionCodes ?? []), [selectedSuite])

  const refresh = useCallback(async () => {
    const client = clientRef.current!
    const downloadedRaw = await client.list()
    const entries = await Promise.all(
      downloadedRaw.map(async (d) => {
        const entry = await client.getEntry(d.id)
        return {
          id: d.id,
          builtAt: d.builtAt,
          downloadedAt: d.downloadedAt,
          bundleVersion: entry?.bundleVersion ?? "0"
        }
      })
    )
    const downloaded: DownloadedRegion[] = entries
    const now = new Date()
    const states: RegionStateMap = {}
    for (const region of OFFLINE_REGIONS) {
      const entry = downloaded.find((d) => d.id === region.id)
      states[region.id] = buildRegionUIState(entry, now)
    }
    dispatch({ type: "hydrate", states, downloaded })
    const totalBytes = await client.getTotalBytes()
    setInstalledBytes(totalBytes)
    setLastManifestCheck(now)
  }, [])

  const maybeDailyManifestCheck = useCallback(async () => {
    let lastCheckMs: number | null = null
    try {
      const raw = window.localStorage.getItem(DAILY_MANIFEST_CHECK_KEY)
      if (raw) lastCheckMs = Number.parseFloat(raw)
    } catch {
      lastCheckMs = null
    }
    const now = Date.now()
    if (lastCheckMs == null || !Number.isFinite(lastCheckMs) || now - lastCheckMs >= ONE_DAY_MS) {
      await refresh()
      try {
        window.localStorage.setItem(DAILY_MANIFEST_CHECK_KEY, String(now))
      } catch {
        // localStorage may be unavailable (private mode); non-blocking
      }
    } else {
      const client = clientRef.current!
      const totalBytes = await client.getTotalBytes()
      setInstalledBytes(totalBytes)
      setLastManifestCheck(new Date(lastCheckMs))
    }
  }, [refresh])

  useEffect(() => {
    void maybeDailyManifestCheck()
  }, [maybeDailyManifestCheck])

  const downloadRegion = useCallback(async (region: OfflineRegion) => {
    const client = clientRef.current!
    if (region.estimatedDownloadBytes >= LARGE_DOWNLOAD_BYTES) {
      setLargeDownloadPrompt({ region, bytes: region.estimatedDownloadBytes })
      return
    }
    dispatch({ type: "set_downloading", regionId: region.id })
    try {
      const graph = await client.download(region, (progress) => {
        dispatch({ type: "set_progress", regionId: region.id, progress })
      })
      const entry = await client.getEntry(region.id)
      dispatch({
        type: "set_ready",
        regionId: region.id,
        builtAt: entry?.builtAt ?? new Date().toISOString(),
        bundleVersion: entry?.bundleVersion ?? "0"
      })
      void graph
      setInstalledBytes(await client.getTotalBytes())
      onRegionDownloaded?.(region.id)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        dispatch({ type: "set_paused", regionId: region.id })
        return
      }
      dispatch({
        type: "set_error",
        regionId: region.id,
        error: err instanceof Error ? err.message : "Download failed"
      })
    }
  }, [onRegionDownloaded])

  const confirmLargeDownload = useCallback(async () => {
    const pending = largeDownloadPrompt
    if (!pending) return
    setLargeDownloadPrompt(null)
    await downloadRegion(pending.region)
  }, [downloadRegion, largeDownloadPrompt])

  const cancelLargeDownload = useCallback(() => {
    setLargeDownloadPrompt(null)
  }, [])

  const removeRegion = useCallback(async (regionId: string) => {
    await clientRef.current!.remove(regionId)
    dispatch({ type: "set_removed", regionId })
    setInstalledBytes(await clientRef.current!.getTotalBytes())
  }, [])

  const updateAllOnWifi = useCallback(async () => {
    setUpdateAllRunning(true)
    try {
      const client = clientRef.current!
      for (const region of OFFLINE_REGIONS) {
        const rs = state.regionStates[region.id]
        if (!rs || rs.status !== "ready") continue
        if (rs.stalenessTier !== "stale" && rs.stalenessTier !== "very-stale" && rs.stalenessTier !== "aging") continue
        dispatch({ type: "set_downloading", regionId: region.id })
        try {
          await client.download(region, (progress) => {
            dispatch({ type: "set_progress", regionId: region.id, progress })
          })
          const entry = await client.getEntry(region.id)
          dispatch({
            type: "set_ready",
            regionId: region.id,
            builtAt: entry?.builtAt ?? new Date().toISOString(),
            bundleVersion: entry?.bundleVersion ?? "0"
          })
          onRegionDownloaded?.(region.id)
        } catch (err) {
          dispatch({
            type: "set_error",
            regionId: region.id,
            error: err instanceof Error ? err.message : "Update failed"
          })
        }
      }
      setInstalledBytes(await client.getTotalBytes())
      setNotice("Wi-Fi update finished. Routing is never blocked based on age alone.")
    } finally {
      setUpdateAllRunning(false)
    }
  }, [onRegionDownloaded, state.regionStates])

  const handleDownloadModeChange = useCallback((next: DownloadModePickerValue) => {
    setDownloadMode(next)
    onDownloadModeChange?.(next)
  }, [onDownloadModeChange])

  const suggested = useMemo(() => suggestRegionsForRoute(activeWaypoints), [activeWaypoints])

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
      case "paused": return `Paused at ${Math.round(rs.progress * 100)}%`
      case "ready": return "Ready"
      case "stale": return "Update available"
      case "failed": return rs.error ?? "Download failed"
      case "expired": return "Expired"
      default: return "Download"
    }
  }

  const pendingRegionForProjection = useMemo(() => {
    if (largeDownloadPrompt) return largeDownloadPrompt.region
    return null
  }, [largeDownloadPrompt])

  const projectionPackageBytes = pendingRegionForProjection?.estimatedDownloadBytes ?? null

  const corridorRebuildPrompt = useMemo(
    () => findCorridorRebuildCandidate(pendingRoute, state.regionStates),
    [pendingRoute, state.regionStates]
  )

  const handleCorridorRebuild = useCallback(() => {
    if (!corridorRebuildPrompt || !onBuildCorridor) return
    onBuildCorridor(corridorRebuildPrompt.route)
  }, [corridorRebuildPrompt, onBuildCorridor])

  return (
    <div className="region-downloads-panel">
      <h3 className="region-heading">
        <Database aria-hidden="true" weight="regular" />
        {" "}Offline Routing Data
      </h3>
      <p className="region-description">
        Download regional road-graph tiles to your device for routing when you have no signal.
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

      <AriaLiveRegion id="region-downloads-notice" politeness="polite" message={notice} />

      <RegionSuitePicker
        selectedSuiteId={selectedSuiteId}
        onSelectSuite={(next) => setSelectedSuiteId(next?.id ?? null)}
      />

      <DownloadModePicker value={downloadMode} onChange={handleDownloadModeChange} />

      <div className="region-cadence">
        <div className="region-cadence-row">
          <span>
            Manifest checked:
            {" "}
            <strong>{lastManifestCheck ? lastManifestCheck.toLocaleString() : "—"}</strong>
          </span>
          <span>Checked once per day on app open; not in background.</span>
        </div>
        <div className="region-cadence-actions">
          <button
            type="button"
            className="region-cadence-btn"
            onClick={() => void refresh()}
            aria-label="Refresh region manifests now"
          >
            <ArrowClockwise aria-hidden="true" weight="bold" />
            Refresh
          </button>
          <button
            type="button"
            className="region-cadence-btn region-cadence-wifi"
            onClick={() => void updateAllOnWifi()}
            disabled={updateAllRunning}
            aria-label="Update all stale regions on Wi-Fi"
          >
            <WifiHigh aria-hidden="true" weight="bold" />
            {updateAllRunning ? "Updating…" : "Update all on Wi-Fi"}
          </button>
        </div>
      </div>

      {suggested.length > 0 && activeWaypoints.length > 0 && (
        <div className="region-suggested">
          <p className="region-suggested-label">
            <Info aria-hidden="true" weight="fill" /> Suggested for your route:
          </p>
          <div className="region-suggested-list">
            {suggested.map((r) => (
              <span key={r.id} className="region-suggested-chip">{r.code}</span>
            ))}
          </div>
        </div>
      )}

      <ul className="region-list">
        {OFFLINE_REGIONS.map((region) => {
          const rs = state.regionStates[region.id] ?? {
            status: "not-downloaded" as RegionDownloadStatus,
            progress: 0,
            error: null,
            stalenessTier: null,
            stalenessLabel: null,
            stalenessGuidance: null,
            bundleVersion: null,
            builtAt: null
          }
          const isSuggested = suggested.some((s) => s.id === region.id)
          const inSuite = suiteRegionCodes.has(region.code)
          const hasProgress = rs.status === "downloading" && rs.progress > 0
          const projBlocked = projection?.permitted === false && largeDownloadPrompt?.region.id === region.id

          return (
            <li
              key={region.id}
              className="region-item"
              data-suite-member={inSuite ? "true" : "false"}
              data-stale-tier={rs.stalenessTier ?? undefined}
              data-suggested={isSuggested ? "true" : "false"}
            >
              <div className="region-item-info">
                <span className="region-item-name">
                  {region.name}
                  {inSuite && <span className="region-suggested-chip">in suite</span>}
                </span>
                <span className="region-item-meta">
                  {formatRegionBytes(region.estimatedDownloadBytes)} • {region.estimatedNodeCount.toLocaleString()} nodes
                </span>
                <span className="region-item-meta">
                  Map data as of {region.dataDate.slice(0, 10)}
                </span>
                {rs.stalenessLabel && (
                  <span
                    className="region-item-staleness"
                    data-tier={rs.stalenessTier ?? undefined}
                    title={rs.stalenessGuidance ?? undefined}
                  >
                    {rs.stalenessLabel}
                  </span>
                )}
                {hasProgress && (
                  <progress
                    className="region-progress"
                    value={rs.progress}
                    max={1}
                    aria-label={`Download progress for ${region.name}`}
                  />
                )}
              </div>
              <div className="region-item-actions">
                {rs.status === "not-downloaded" || rs.status === "failed" || rs.status === "expired" || rs.status === "paused" ? (
                  <button
                    type="button"
                    className="region-download-btn"
                    onClick={() => downloadRegion(region)}
                    aria-label={`${rs.status === "paused" ? "Resume" : "Download"} offline data for ${region.name}`}
                    data-blocked={projBlocked ? "true" : "false"}
                    disabled={projBlocked}
                  >
                    {statusIcon(rs)}
                    <span>{rs.status === "paused" ? "Resume" : statusLabel(rs)}</span>
                  </button>
                ) : rs.status === "downloading" ? (
                  <button
                    type="button"
                    className="region-cancel-btn"
                    onClick={() => clientRef.current?.pause(region.id)}
                    aria-label={`Pause download for ${region.name}`}
                  >
                    Pause
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

      {largeDownloadPrompt && (
        <div className="region-large-prompt" role="alertdialog" aria-labelledby="region-large-prompt-label">
          <span id="region-large-prompt-label" className="region-large-prompt-label">
            <Warning aria-hidden="true" weight="fill" />
            Large download ahead ({formatRegionBytes(largeDownloadPrompt.bytes)})
          </span>
          <p className="region-description">
            {largeDownloadPrompt.region.name} is a large package. Connect to Wi-Fi before continuing to avoid mobile data charges.
          </p>
          <div className="region-large-prompt-actions">
            <button
              type="button"
              className="region-cadence-btn"
              onClick={cancelLargeDownload}
            >
              Not now
            </button>
            <button
              type="button"
              className="region-cadence-btn region-cadence-wifi"
              onClick={() => void confirmLargeDownload()}
            >
              Download now
            </button>
          </div>
        </div>
      )}

      {corridorRebuildPrompt && (
        <div className="region-corridor-rebuild" role="alertdialog" aria-labelledby="region-corridor-rebuild-label">
          <span id="region-corridor-rebuild-label" className="region-corridor-rebuild-label">
            <ArrowsClockwise aria-hidden="true" weight="bold" />
            A newer {corridorRebuildPrompt.region.name} map is available. Rebuild this ride&apos;s offline corridor?
          </span>
          <p className="region-description">
            We never silently rebuild a saved ride immediately before departure.
          </p>
          <div className="region-corridor-rebuild-actions">
            <button
              type="button"
              className="region-cadence-btn"
              onClick={() => setNotice("Corridor rebuild deferred. The previous offline corridor remains in use.")}
            >
              Not now
            </button>
            <button
              type="button"
              className="region-cadence-btn region-cadence-wifi"
              onClick={handleCorridorRebuild}
            >
              Rebuild now
            </button>
          </div>
        </div>
      )}

      <div className="region-footer">
        <StorageQuotaMeter
          installedBytes={installedBytes}
          pendingPackageBytes={projectionPackageBytes}
          onProjectionChange={setProjection}
          onPersistentChange={() => { /* surface in meter; no panel-level action */ }}
        />

        <p className="region-odbl">
          <strong>Open Database License (ODbL)</strong>
          Map data ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenStreetMap
          </a>{" "}
          contributors. The data is licensed under the Open Database License (ODbL). You are free to copy, distribute, transmit and adapt the data, as long as you credit OpenStreetMap and its contributors. If you alter or build upon the data, you may distribute the result only under the same licence. See the full licence text at opendatacommons.org/licenses/odbl.
        </p>
      </div>
    </div>
  )
}
