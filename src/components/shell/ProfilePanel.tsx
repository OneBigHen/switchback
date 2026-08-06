"use client"

import { DownloadSimple, HardDrives, Trash, UserCircle } from "@phosphor-icons/react"
import { useState } from "react"
import type { ThemePreference } from "@/lib/client/app-navigation"
import {
  getActiveBike,
  loadRiderSettings,
  saveRiderSettings,
  type BikeCategory,
  type RiderSettings,
  type UnknownSurfacePolicy
} from "@/lib/settings/rider-settings"

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
    <section className="profile-panel" aria-label="Profile and settings">
      <header>
        <UserCircle aria-hidden="true" weight="fill" />
        <div>
          <span className="eyebrow">Rider profile</span>
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

      {notice ? <p className="profile-notice" role="status">{notice}</p> : null}
    </section>
  )
}
