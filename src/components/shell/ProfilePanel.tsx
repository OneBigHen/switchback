"use client"

import { DownloadSimple, HardDrives, Trash, UserCircle } from "@phosphor-icons/react"
import { QRCodeSVG } from "qrcode.react"
import { useEffect, useMemo, useState } from "react"
import type { ThemePreference } from "@/lib/client/app-navigation"
import {
  getActiveBike,
  loadRiderSettings,
  saveRiderSettings,
  type BikeCategory,
  type RiderSettings,
  type UnknownSurfacePolicy
} from "@/lib/settings/rider-settings"
import { collectDiagnostics } from "@/lib/client/diagnostics"
import { RegionDownloadClient } from "@/lib/storage/region-download-client"
import type { DiagnosticsSnapshot } from "@/lib/domain/diagnostics"
import { DiagnosticsPanel } from "./DiagnosticsPanel"
import { authenticatePasskey, registerPasskey } from "@/lib/client/passkey"
import { createSyncController } from "@/lib/client/sync-controller"
import type { RecoveryKit } from "@/lib/sync/recovery-kit"
import type { SyncStateRecord } from "@/lib/sync/client-store"

interface ProfilePanelProps {
  theme: ThemePreference
  onThemeChange(theme: ThemePreference): void
  onOpenDownloads(): void
  onResetLearning?(): Promise<void> | void
  onExportLearning?(): Promise<unknown> | unknown
}

export function ProfilePanel({ theme, onThemeChange, onOpenDownloads, onResetLearning, onExportLearning }: ProfilePanelProps) {
  // One versioned settings source (SB-023): the panel reads and writes the
  // same store the planner and learning use, so edits are never orphaned.
  const [settings, setSettings] = useState<RiderSettings>(() => {
    if (typeof window === "undefined") return loadRiderSettings()
    const loaded = loadRiderSettings()
    return loaded
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [identityBusy, setIdentityBusy] = useState<"register" | "authenticate" | null>(null)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot | null>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const syncController = useMemo(() => createSyncController(), [])
  const [syncState, setSyncState] = useState<SyncStateRecord | null>(null)
  const [recoveryKit, setRecoveryKit] = useState<RecoveryKit | null>(null)
  const [recoverySeed, setRecoverySeed] = useState("")
  const [syncBusy, setSyncBusy] = useState<"export" | "import" | "link" | "sync" | null>(null)

  useEffect(() => {
    void syncController.ensureState().then(setSyncState).catch(() => undefined)
  }, [syncController])

  const openDiagnostics = async () => {
    setDiagnosticsOpen(true)
    if (diagnostics) return
    const snapshot = await collectDiagnostics({
      regionClient: new RegionDownloadClient(),
      hasSavedRoutes: true,
      serviceWorkerRegistered: typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? Boolean(navigator.serviceWorker.controller)
        : false,
      fetchHealth: (signal) => fetch("/api/health", { signal }).then((response) => response.json())
    }).catch(() => null)
    if (snapshot) setDiagnostics(snapshot)
  }

  const update = (patch: Partial<RiderSettings> | ((current: RiderSettings) => RiderSettings)) => {
    setSettings((current) => {
      const next = typeof patch === "function" ? patch(current) : { ...current, ...patch }
      saveRiderSettings(next)
      return next
    })
  }

  const updateActiveBike = (patch: Partial<ReturnType<typeof getActiveBike>>) => {
    update((current) => ({
      ...current,
      bikes: current.bikes.map((bike) => bike.id === current.activeBikeId ? { ...bike, ...patch } : bike)
    }))
  }

  const bike = getActiveBike(settings)

  const runIdentity = async (kind: "register" | "authenticate") => {
    setIdentityBusy(kind)
    setNotice(null)
    try {
      if (kind === "register") await registerPasskey(settings.riderName || undefined)
      else await authenticatePasskey()
      setNotice(kind === "register" ? "Switchback ID ready for publishing and sync." : "Signed in with Switchback ID.")
      try {
        setSyncState(await syncController.linkCurrentSession())
      } catch {
        setNotice(kind === "register"
          ? "Switchback ID ready. Link this device below to enable encrypted sync."
          : "Signed in with Switchback ID. Link this device below to enable encrypted sync.")
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Passkey identity could not be completed.")
    } finally {
      setIdentityBusy(null)
    }
  }

  const exportSyncKit = async () => {
    setSyncBusy("export")
    try {
      const kit = await syncController.exportRecoveryKit()
      setRecoveryKit(kit)
      setRecoverySeed(kit.seed)
      const blob = new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "switchback-sync-recovery.json"
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice("Recovery kit exported. Keep the QR code and seed offline.")
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Recovery kit export failed.")
    } finally {
      setSyncBusy(null)
    }
  }

  const importSyncKit = async () => {
    setSyncBusy("import")
    try {
      setSyncState(await syncController.store.importRecoveryKit(recoverySeed))
      setRecoveryKit(null)
      setNotice("Recovery kit installed. Authenticate below to link this device before syncing.")
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Recovery seed could not be imported.")
    } finally {
      setSyncBusy(null)
    }
  }

  const linkSync = async () => {
    setSyncBusy("link")
    try {
      setSyncState(await syncController.linkWithPasskey())
      setNotice("This device is linked. Encrypted sync is ready.")
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "This device could not be linked for sync.")
    } finally {
      setSyncBusy(null)
    }
  }

  const runSync = async () => {
    setSyncBusy("sync")
    try {
      const result = await syncController.sync()
      setNotice(`Encrypted sync complete: ${result.pushed} sent, ${result.pulled} received${result.conflicts ? `, ${result.conflicts} conflict copy created` : ""}.`)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Encrypted sync could not complete.")
    } finally {
      setSyncBusy(null)
    }
  }

  const gravelLabel: Record<BikeCategory, string> = {
    street: "none",
    touring: "none",
    adventure: "maintained",
    "dual-sport": "all"
  }
  const gravelToCategory: Record<string, BikeCategory> = {
    none: "street",
    maintained: "adventure",
    all: "dual-sport"
  }
  const unknownSurfaceToPolicy = (gravel: string): UnknownSurfacePolicy =>
    gravel === "all" ? "allow" : gravel === "maintained" ? "warn" : "warn"

  return (
    <section className="profile-panel sb-bottom-sheet" aria-label="Profile and settings">
      <header>
        <UserCircle aria-hidden="true" weight="fill" />
        <div>
          <h2>You and your bike</h2>
        </div>
      </header>

      <label>
        Rider name
        <input
          aria-label="Rider name"
          value={settings.riderName}
          maxLength={80}
          onChange={(event) => update({ riderName: event.currentTarget.value })}
        />
      </label>

      <label>
        Motorcycle name
        <input
          aria-label="Motorcycle name"
          value={bike.name}
          maxLength={80}
          onChange={(event) => updateActiveBike({ name: event.currentTarget.value })}
        />
      </label>

      <label>
        Fuel range (miles)
        <input
          aria-label="Fuel range in miles"
          type="number"
          min={0}
          max={1000}
          value={bike.fuelRangeMiles}
          onChange={(event) => {
            const value = Number(event.currentTarget.value)
            if (Number.isFinite(value) && value >= 0) updateActiveBike({ fuelRangeMiles: value })
          }}
        />
      </label>

      <label>
        Gravel tolerance
        <select
          aria-label="Gravel tolerance"
          value={gravelLabel[bike.category]}
          onChange={(event) => {
            const category = gravelToCategory[event.currentTarget.value] ?? "street"
            updateActiveBike({
              category,
              maintainedGravel: category === "adventure" || category === "dual-sport",
              roughTracks: category === "dual-sport",
              unknownSurfacePolicy: unknownSurfaceToPolicy(event.currentTarget.value)
            })
          }}
        >
          <option value="none">None — paved only</option>
          <option value="maintained">Maintained gravel</option>
          <option value="all">All dirt and gravel</option>
        </select>
      </label>

      <label>
        Units
        <select
          aria-label="Units"
          value={settings.units}
          onChange={(event) => update({ units: event.currentTarget.value as RiderSettings["units"] })}
        >
          <option value="imperial">Miles</option>
          <option value="metric">Kilometers</option>
        </select>
      </label>

      <label>
        Voice guidance
        <input
          type="checkbox"
          aria-label="Voice guidance"
          checked={settings.voiceGuidance}
          onChange={(event) => update({ voiceGuidance: event.currentTarget.checked })}
        />
      </label>

      <label>
        Learn from my rides
        <input
          type="checkbox"
          aria-label="Learn from my rides"
          checked={settings.learningEnabled}
          onChange={(event) => update({ learningEnabled: event.currentTarget.checked })}
        />
      </label>

      <div className="profile-actions">
        <button type="button" onClick={onOpenDownloads}>
          <DownloadSimple aria-hidden="true" />
          Offline regions
        </button>
        <button type="button" onClick={() => void Promise.resolve(onExportLearning?.()).then(() => setNotice("Learning profile exported.")).catch(() => setNotice("Export failed."))}>
          <HardDrives aria-hidden="true" />
          Export learning
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (!window.confirm("Reset all learned preferences? This cannot be undone.")) return
            void Promise.resolve(onResetLearning?.()).then(() => setNotice("Learning profile reset.")).catch(() => setNotice("Reset failed."))
          }}
        >
          <Trash aria-hidden="true" />
          Reset learning
        </button>
      </div>

      <section className="profile-identity" aria-labelledby="switchback-id-title">
        <h3 id="switchback-id-title">Switchback ID</h3>
        <p>Use a passkey for publishing and encrypted sync. Planning and riding stay on this device without an account.</p>
        <div className="profile-actions">
          <button type="button" className="primary-action" disabled={identityBusy !== null} onClick={() => void runIdentity("register")}>
            {identityBusy === "register" ? "Creating…" : "Create Switchback ID"}
          </button>
          <button type="button" disabled={identityBusy !== null} onClick={() => void runIdentity("authenticate")}>
            {identityBusy === "authenticate" ? "Checking…" : "Use existing passkey"}
          </button>
        </div>
      </section>

      <section className="profile-identity" aria-labelledby="sync-title">
        <h3 id="sync-title">Saved routes and rider settings</h3>
        <p>The recovery kit decrypts your local data. A verified Switchback ID still must link this device before the sync service can be used.</p>
        <div className="profile-actions">
          <button type="button" onClick={() => void exportSyncKit()} disabled={syncBusy !== null}>
            {syncBusy === "export" ? "Preparing…" : "Export recovery kit"}
          </button>
          <button type="button" onClick={() => void linkSync()} disabled={syncBusy !== null}>
            {syncBusy === "link" ? "Linking…" : syncState?.linked ? "Relink with passkey" : "Authenticate and link device"}
          </button>
          <button type="button" className="primary-action" onClick={() => void runSync()} disabled={syncBusy !== null || !syncState?.linked}>
            {syncBusy === "sync" ? "Syncing…" : "Sync now"}
          </button>
        </div>
        <label>
          Recovery seed
          <input
            aria-label="Recovery seed"
            value={recoverySeed}
            onChange={(event) => setRecoverySeed(event.currentTarget.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="button" onClick={() => void importSyncKit()} disabled={syncBusy !== null || recoverySeed.trim().length === 0}>
          {syncBusy === "import" ? "Importing…" : "Import recovery seed"}
        </button>
        {recoveryKit ? (
          <div className="profile-recovery-kit" aria-label="Recovery kit">
            <QRCodeSVG value={recoveryKit.qrPayload} size={192} level="M" marginSize={2} title="Switchback encrypted sync recovery QR code" />
            <code>{recoveryKit.seed}</code>
          </div>
        ) : null}
        {syncState?.linked ? <p>Device linked for encrypted sync.</p> : <p>Device not linked. Sync remains disabled until passkey authentication succeeds.</p>}
      </section>

      <label className="profile-theme">
        Theme
        <select
          aria-label="Theme"
          value={theme}
          onChange={(event) => onThemeChange(event.currentTarget.value as ThemePreference)}
        >
          <option value="auto">Auto</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>

      <button type="button" className="profile-diagnostics-toggle" onClick={() => void openDiagnostics()}>
        Diagnostics
      </button>

      {diagnosticsOpen ? (diagnostics ? <DiagnosticsPanel snapshot={diagnostics} /> : <p role="status">Gathering diagnostics…</p>) : null}

      {notice ? <p className="profile-notice" role="status">{notice}</p> : null}
    </section>
  )
}
