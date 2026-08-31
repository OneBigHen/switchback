"use client"

import { ArrowRight, SlidersHorizontal } from "@phosphor-icons/react"
import { useRef, useState } from "react"
import type { ThemePreference } from "@/lib/client/app-navigation"
import {
  getActiveBike,
  loadRiderSettings,
  saveRiderSettings,
  type BikeCategory,
  type RiderBike,
  type RiderSettings
} from "@/lib/settings/rider-settings"
import { SettingRow } from "@/components/v2/SettingRow"
import { SettingsSurface } from "./SettingsSurface"
import { UiCustomizationSettings } from "./UiCustomizationSettings"
import styles from "./SettingsDestination.module.css"

export interface SettingsDestinationProps {
  theme: ThemePreference
  onThemeChange(theme: ThemePreference): void
  onOpenAdvancedSettings(): void
  onSettingsChange?(settings: RiderSettings): void
}

const categoryOptions: Array<{ value: BikeCategory; label: string }> = [
  { value: "street", label: "Street" },
  { value: "touring", label: "Touring" },
  { value: "adventure", label: "Adventure" },
  { value: "dual-sport", label: "Dual sport" }
]

function bikeForCategory(bike: RiderBike, category: BikeCategory): RiderBike {
  return {
    ...bike,
    category,
    maintainedGravel: category === "adventure" || category === "dual-sport",
    roughTracks: category === "dual-sport",
    unknownSurfacePolicy: category === "dual-sport" ? "allow" : "warn"
  }
}

export function SettingsDestination({ theme, onThemeChange, onOpenAdvancedSettings, onSettingsChange }: SettingsDestinationProps) {
  const [settings, setSettings] = useState<RiderSettings>(() => loadRiderSettings())
  const activeBikeSelectRef = useRef<HTMLSelectElement | null>(null)
  const motorcycleNameRef = useRef<HTMLInputElement | null>(null)

  // Persisting and notifying the parent are side effects, so they must not run
  // inside the state updater: React may call an updater during render, and
  // onSettingsChange sets state in PlannerShell — which React reports as
  // "Cannot update a component while rendering a different component".
  // These handlers all run from discrete user events, so deriving the next
  // value from the current render's state is safe.
  const update = (patch: Partial<RiderSettings> | ((current: RiderSettings) => RiderSettings)) => {
    const next = typeof patch === "function" ? patch(settings) : { ...settings, ...patch }
    saveRiderSettings(next)
    setSettings(next)
    onSettingsChange?.(next)
  }

  const updateBike = (patch: Partial<RiderBike> | ((bike: RiderBike) => RiderBike)) => {
    update((current) => ({
      ...current,
      bikes: current.bikes.map((bike) => {
        if (bike.id !== current.activeBikeId) return bike
        return typeof patch === "function" ? patch(bike) : { ...bike, ...patch }
      })
    }))
  }

  const activeBike = getActiveBike(settings)

  return (
    <main className={styles.destination} aria-label="Settings destination">
      <SettingsSurface
        settings={settings}
        onEditBike={() => motorcycleNameRef.current?.focus()}
        onChangeBike={() => activeBikeSelectRef.current?.focus()}
      >
        <section className={styles.section} aria-labelledby="rider-bike-settings-title">
          <header className={styles.sectionHeader}>
            <div>
              <span>Rider profile</span>
              <h2 id="rider-bike-settings-title">Rider & bike</h2>
            </div>
            <p>These values affect range warnings, surface access, and learned route preferences.</p>
          </header>

          <div className={styles.rows}>
            <SettingRow title="Rider name" description="Shown on this device and used for your Switchback identity.">
              <input
                aria-label="Rider name"
                value={settings.riderName}
                maxLength={80}
                placeholder="Your name"
                onChange={(event) => update({ riderName: event.currentTarget.value })}
              />
            </SettingRow>

            <SettingRow title="Active motorcycle" description="Switch routing constraints without changing saved bike identities.">
              <select
                ref={activeBikeSelectRef}
                aria-label="Active motorcycle"
                value={settings.activeBikeId}
                onChange={(event) => update({ activeBikeId: event.currentTarget.value })}
              >
                {settings.bikes.map((bike) => <option key={bike.id} value={bike.id}>{bike.name}</option>)}
              </select>
            </SettingRow>

            <SettingRow title="Motorcycle name" description="A display name only; learned preferences remain keyed to the stable bike id.">
              <input
                ref={motorcycleNameRef}
                aria-label="Motorcycle name"
                value={activeBike.name}
                maxLength={80}
                required
                onChange={(event) => {
                  const name = event.currentTarget.value
                  if (name.trim()) updateBike({ name })
                }}
              />
            </SettingRow>

            <SettingRow title="Bike category" description="Controls how aggressively Switchback can use gravel and rough tracks.">
              <select
                aria-label="Bike category"
                value={activeBike.category}
                onChange={(event) => updateBike((bike) => bikeForCategory(bike, event.currentTarget.value as BikeCategory))}
              >
                {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </SettingRow>

            <SettingRow title="Fuel range" description="Used for fuel-stop and reserve warnings on longer rides.">
              <div className={styles.numberControl}>
                <input
                  aria-label="Fuel range in miles"
                  type="number"
                  min={1}
                  max={1000}
                  value={activeBike.fuelRangeMiles}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value)
                    if (Number.isFinite(value) && value > 0) updateBike({ fuelRangeMiles: value })
                  }}
                />
                <span>mi</span>
              </div>
            </SettingRow>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="ride-defaults-title">
          <header className={styles.sectionHeader}>
            <div>
              <span>Every new plan</span>
              <h2 id="ride-defaults-title">Ride defaults</h2>
            </div>
            <p>Useful defaults stay close. Route-specific choices still win when you change them in Plan.</p>
          </header>

          <div className={styles.rows}>
            <SettingRow title="Default route style" description="The starting profile for a new destination or loop.">
              <select aria-label="Default route style" value={settings.defaultProfile} onChange={(event) => update({ defaultProfile: event.currentTarget.value as RiderSettings["defaultProfile"] })}>
                <option value="balanced">Balanced</option>
                <option value="twisty">Twisty</option>
                <option value="scenic">Scenic</option>
                <option value="adventure">Adventure</option>
                <option value="gravel">Gravel</option>
                <option value="quick">Quick</option>
                <option value="avoid-highways">Avoid highways</option>
              </select>
            </SettingRow>

            <SettingRow title="Avoid highways" description="Start new plans with highway avoidance enabled.">
              <label className={styles.switchControl}>
                <input
                  type="checkbox"
                  aria-label="Avoid highways by default"
                  checked={settings.defaultAvoidHighways}
                  onChange={(event) => update({ defaultAvoidHighways: event.currentTarget.checked })}
                />
                <span aria-hidden="true" />
              </label>
            </SettingRow>

            <SettingRow title="Units" description="Distance and ride metrics across the app.">
              <select aria-label="Units" value={settings.units} onChange={(event) => update({ units: event.currentTarget.value as RiderSettings["units"] })}>
                <option value="imperial">Miles</option>
                <option value="metric">Kilometers</option>
              </select>
            </SettingRow>

            <SettingRow title="Voice guidance" description="Spoken prompts during active navigation.">
              <label className={styles.switchControl}>
                <input type="checkbox" aria-label="Voice guidance" checked={settings.voiceGuidance} onChange={(event) => update({ voiceGuidance: event.currentTarget.checked })} />
                <span aria-hidden="true" />
              </label>
            </SettingRow>

            <SettingRow title="Learn from my rides" description="Use local ride choices to improve ranking for this motorcycle.">
              <label className={styles.switchControl}>
                <input type="checkbox" aria-label="Learn from my rides" checked={settings.learningEnabled} onChange={(event) => update({ learningEnabled: event.currentTarget.checked })} />
                <span aria-hidden="true" />
              </label>
            </SettingRow>

            <SettingRow title="Theme" description="Use the system appearance or lock Switchback to light or dark.">
              <select
                aria-label="Theme"
                value={settings.theme ?? theme}
                onChange={(event) => {
                  const next = event.currentTarget.value as ThemePreference
                  update({ theme: next })
                  onThemeChange(next)
                }}
              >
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </SettingRow>
          </div>
        </section>

        <UiCustomizationSettings
          value={settings.uiPreferences}
          onChange={(uiPreferences) => update({ uiPreferences })}
        />

        <section className={`${styles.section} ${styles.advanced}`} aria-labelledby="settings-advanced-entry-title">
          <div className={styles.advancedIcon} aria-hidden="true"><SlidersHorizontal weight="bold" /></div>
          <div>
            <span>Private tools</span>
            <h2 id="settings-advanced-entry-title">Account, sync & data</h2>
            <p>Switchback ID, encrypted recovery, offline regions, learning export/reset, and diagnostics stay behind one advanced entry point.</p>
          </div>
          <button type="button" onClick={onOpenAdvancedSettings}>
            <span>Account, sync & data</span>
            <ArrowRight weight="bold" aria-hidden="true" />
          </button>
        </section>
      </SettingsSurface>
    </main>
  )
}
