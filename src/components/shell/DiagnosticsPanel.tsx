"use client"

import { Info } from "@phosphor-icons/react"
import type { DiagnosticsSnapshot } from "@/lib/domain/diagnostics"
import { offlineLevelLabel } from "@/lib/offline/readiness"
import { formatBytes, providerLabel, summarizeStorage } from "@/lib/domain/diagnostics"

interface DiagnosticsPanelProps {
  snapshot: DiagnosticsSnapshot
}

/**
 * Renders the honest diagnostics snapshot (SB-028): app/offline/storage/
 * provider health with warnings. Deliberately no "all good" badge — each
 * value states what is actually known.
 */
export function DiagnosticsPanel({ snapshot }: DiagnosticsPanelProps) {
  return (
    <section className="diagnostics-panel" aria-label="Diagnostics">
      <header>
        <Info aria-hidden="true" weight="fill" />
        <div>
          <span className="eyebrow">Diagnostics</span>
          <h2>App, storage, and provider health</h2>
        </div>
      </header>

      <dl className="diagnostics-list">
        <div>
          <dt>App version</dt>
          <dd>{snapshot.appVersion}{snapshot.buildId ? ` · ${snapshot.buildId}` : ""}</dd>
        </div>
        <div>
          <dt>Offline level</dt>
          <dd>{offlineLevelLabel(snapshot.readiness)}</dd>
        </div>
        <div>
          <dt>Storage</dt>
          <dd>{summarizeStorage(snapshot.storage)}</dd>
        </div>
        <div>
          <dt>Router (GraphHopper)</dt>
          <dd>{providerLabel(snapshot.providers.graphHopper)}</dd>
        </div>
        <div>
          <dt>Valhalla</dt>
          <dd>{providerLabel(snapshot.providers.valhalla)}</dd>
        </div>
        <div>
          <dt>Place search (Photon)</dt>
          <dd>{providerLabel(snapshot.providers.photon)}</dd>
        </div>
        <div>
          <dt>Offline regions</dt>
          <dd>{snapshot.storage.regionCount}</dd>
        </div>
        <div>
          <dt>Saved routes / trips</dt>
          <dd>{snapshot.storage.routeCount} / {snapshot.storage.tripCount}</dd>
        </div>
        <div>
          <dt>Browser heap</dt>
          <dd>{formatBytes(snapshot.runtime.jsHeapUsedBytes)} used · {formatBytes(snapshot.runtime.jsHeapLimitBytes)} limit</dd>
        </div>
        <div>
          <dt>Tracked resources</dt>
          <dd>{snapshot.runtime.timerCount} timers · {snapshot.runtime.gpsWatchCount} GPS watches · {snapshot.runtime.workerCount} workers</dd>
        </div>
        <div>
          <dt>Map resources</dt>
          <dd>{snapshot.runtime.mapSourceCount == null || snapshot.runtime.mapLayerCount == null
            ? "not measurable"
            : `${snapshot.runtime.mapSourceCount} sources · ${snapshot.runtime.mapLayerCount} layers`}</dd>
        </div>
        <div>
          <dt>Server memory</dt>
          <dd>{formatBytes(snapshot.server.rssBytes)} RSS · {formatBytes(snapshot.server.heapUsedBytes)} heap</dd>
        </div>
        <div>
          <dt>Route queue / cache</dt>
          <dd>{snapshot.server.routeRunningJobs == null || snapshot.server.routeQueuedJobs == null || snapshot.server.routeCacheEntries == null
            ? "not measurable"
            : `${snapshot.server.routeRunningJobs} running · ${snapshot.server.routeQueuedJobs} queued · ${snapshot.server.routeCacheEntries} cached`}</dd>
        </div>
      </dl>

      {snapshot.warnings.length > 0 ? (
        <ul className="diagnostics-warnings" aria-label="Diagnostics warnings">
          {snapshot.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : (
        <p className="diagnostics-ok">No unresolved warnings from the local snapshot.</p>
      )}
    </section>
  )
}
