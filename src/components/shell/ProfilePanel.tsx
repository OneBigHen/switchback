"use client"

import {
  DownloadSimple,
  HardDrives,
  Key,
  ShieldCheck,
  Trash,
  Wrench,
  X
} from "@phosphor-icons/react"
import { QRCodeSVG } from "qrcode.react"
import { useEffect, useMemo, useState } from "react"
import { loadRiderSettings } from "@/lib/settings/rider-settings"
import { collectDiagnostics } from "@/lib/client/diagnostics"
import { RegionDownloadClient } from "@/lib/storage/region-download-client"
import type { DiagnosticsSnapshot } from "@/lib/domain/diagnostics"
import { DiagnosticsPanel } from "./DiagnosticsPanel"
import { authenticatePasskey, registerPasskey } from "@/lib/client/passkey"
import { createSyncController } from "@/lib/client/sync-controller"
import type { RecoveryKit } from "@/lib/sync/recovery-kit"
import type { SyncStateRecord } from "@/lib/sync/client-store"
import styles from "./ProfilePanel.module.css"
import { ModalFocusScope } from "@/components/planner/a11y/ModalFocusScope"

interface ProfilePanelProps {
  onOpenDownloads(): void
  onResetLearning?(): Promise<void> | void
  onExportLearning?(): Promise<unknown> | unknown
  onClose?(): void
}

/**
 * Advanced account/data tools only. Everyday rider, bike, routing and theme
 * preferences belong to SettingsDestination and must never be duplicated here.
 */
export function ProfilePanel({
  onOpenDownloads,
  onResetLearning,
  onExportLearning,
  onClose
}: ProfilePanelProps) {
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

  const runIdentity = async (kind: "register" | "authenticate") => {
    setIdentityBusy(kind)
    setNotice(null)
    try {
      const riderName = loadRiderSettings().riderName || undefined
      if (kind === "register") await registerPasskey(riderName)
      else await authenticatePasskey()
      try {
        setSyncState(await syncController.linkCurrentSession())
        setNotice(kind === "register"
          ? "Switchback ID ready and this device is linked for encrypted sync."
          : "Signed in and this device is linked for encrypted sync.")
      } catch {
        setNotice(kind === "register"
          ? "Switchback ID ready. Link this device below to enable encrypted sync."
          : "Signed in. Link this device below to enable encrypted sync.")
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
      setNotice("Recovery kit installed. Authenticate and link this device before syncing.")
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

  const exportLearning = () => {
    setNotice(null)
    void Promise.resolve(onExportLearning?.())
      .then((profile) => {
        const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = "switchback-learning-profile.json"
        anchor.click()
        URL.revokeObjectURL(url)
        setNotice("Learning profile exported.")
      })
      .catch(() => setNotice("Learning profile export failed."))
  }

  const resetLearning = () => {
    if (!window.confirm("Reset all learned preferences? This cannot be undone.")) return
    setNotice(null)
    void Promise.resolve(onResetLearning?.())
      .then(() => setNotice("Learning profile reset."))
      .catch(() => setNotice("Learning profile reset failed."))
  }

  return (
    <ModalFocusScope onEscape={() => onClose?.()}>
    <div className={styles.scrim} role="dialog" aria-modal="true" aria-labelledby="advanced-settings-title">
      <section className={styles.panel} aria-label="Account, sync & rider data">
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.eyebrow}>Advanced</span>
            <h2 id="advanced-settings-title">Account, sync & rider data</h2>
            <p>Identity, encrypted backup, offline maps and diagnostics. Riding still works without an account.</p>
          </div>
          {onClose ? (
            <button className={styles.closeButton} type="button" aria-label="Close account and data" onClick={onClose}>
              <X weight="bold" aria-hidden="true" />
            </button>
          ) : null}
        </header>

        <div className={styles.body}>
          <section className={styles.section} aria-labelledby="switchback-id-title">
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon} aria-hidden="true"><Key weight="bold" /></span>
              <div>
                <h3 id="switchback-id-title">Switchback ID</h3>
                <p>Passkey identity for publishing and linking encrypted data across your devices.</p>
              </div>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryButton} disabled={identityBusy !== null} onClick={() => void runIdentity("register")}>
                {identityBusy === "register" ? "Creating…" : "Create Switchback ID"}
              </button>
              <button type="button" disabled={identityBusy !== null} onClick={() => void runIdentity("authenticate")}>
                {identityBusy === "authenticate" ? "Checking…" : "Use existing passkey"}
              </button>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="encrypted-sync-title">
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon} aria-hidden="true"><ShieldCheck weight="bold" /></span>
              <div>
                <h3 id="encrypted-sync-title">Encrypted sync</h3>
                <p>Saved routes and rider settings are encrypted on this device before they leave it.</p>
              </div>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => void exportSyncKit()} disabled={syncBusy !== null}>
                {syncBusy === "export" ? "Preparing…" : "Export recovery kit"}
              </button>
              <button type="button" onClick={() => void linkSync()} disabled={syncBusy !== null}>
                {syncBusy === "link" ? "Linking…" : syncState?.linked ? "Relink with passkey" : "Authenticate and link device"}
              </button>
              <button type="button" className={styles.primaryButton} onClick={() => void runSync()} disabled={syncBusy !== null || !syncState?.linked}>
                {syncBusy === "sync" ? "Syncing…" : "Sync now"}
              </button>
            </div>
            <div className={styles.recovery}>
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
              <button className={styles.importButton} type="button" onClick={() => void importSyncKit()} disabled={syncBusy !== null || recoverySeed.trim().length === 0}>
                {syncBusy === "import" ? "Importing…" : "Import seed"}
              </button>
            </div>
            {recoveryKit ? (
              <div className={styles.recoveryKit} aria-label="Recovery kit">
                <QRCodeSVG value={recoveryKit.qrPayload} size={192} level="M" marginSize={2} title="Switchback encrypted sync recovery QR code" />
                <code>{recoveryKit.seed}</code>
              </div>
            ) : null}
            <p className={styles.status}>{syncState?.linked ? "Device linked for encrypted sync." : "Device not linked. Sync stays disabled until passkey authentication succeeds."}</p>
          </section>

          <section className={styles.section} aria-labelledby="local-data-title">
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon} aria-hidden="true"><HardDrives weight="bold" /></span>
              <div>
                <h3 id="local-data-title">Offline & local data</h3>
                <p>Control map storage and your private preference-learning data without leaving the device-first workflow.</p>
              </div>
            </div>
            <div className={styles.dataGrid}>
              <button className={styles.dataAction} type="button" onClick={onOpenDownloads}>
                <DownloadSimple weight="bold" aria-hidden="true" />
                <strong>Offline regions</strong>
              </button>
              <button className={styles.dataAction} type="button" onClick={exportLearning} disabled={!onExportLearning}>
                <HardDrives weight="bold" aria-hidden="true" />
                <strong>Export learning</strong>
              </button>
              <button className={`${styles.dataAction} ${styles.dangerButton}`} type="button" onClick={resetLearning} disabled={!onResetLearning}>
                <Trash weight="bold" aria-hidden="true" />
                <strong>Reset learning</strong>
              </button>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="diagnostics-title">
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon} aria-hidden="true"><Wrench weight="bold" /></span>
              <div>
                <h3 id="diagnostics-title">Diagnostics</h3>
                <p>Inspect local storage, service worker and provider health when something does not look right.</p>
              </div>
            </div>
            <div className={styles.actions}>
              <button className={styles.diagnosticsButton} type="button" aria-expanded={diagnosticsOpen} onClick={() => void openDiagnostics()}>
                {diagnosticsOpen ? "Refresh diagnostics" : "Open diagnostics"}
              </button>
            </div>
            {diagnosticsOpen ? (diagnostics ? <DiagnosticsPanel snapshot={diagnostics} /> : <p className={styles.status} role="status">Gathering diagnostics…</p>) : null}
          </section>
        </div>

        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      </section>
    </div>
    </ModalFocusScope>
  )
}
