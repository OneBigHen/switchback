"use client"

import { DownloadSimple, HardDrives, Trash, UserCircle } from "@phosphor-icons/react"
import { useState } from "react"
import type { ThemePreference } from "@/lib/client/app-navigation"

const PROFILE_KEY = "switchback:rider-profile"

interface LocalRiderProfile {
  riderName: string
  motorcycleName: string
  routingDefault: "quick" | "twisty" | "scenic" | "adventure"
  fuelRangeMiles: number
  gravelTolerance: "none" | "maintained" | "all"
  voice: boolean
  units: "imperial" | "metric"
  mapPreference: "clean" | "explorer" | "night"
}

const defaultProfile: LocalRiderProfile = {
  riderName: "Local rider",
  motorcycleName: "My motorcycle",
  routingDefault: "twisty",
  fuelRangeMiles: 160,
  gravelTolerance: "maintained",
  voice: true,
  units: "imperial",
  mapPreference: "clean"
}

function loadProfile(): LocalRiderProfile {
  if (typeof window === "undefined") return defaultProfile
  try {
    return { ...defaultProfile, ...JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}") }
  } catch {
    return defaultProfile
  }
}

interface ProfilePanelProps {
  theme: ThemePreference
  onThemeChange(theme: ThemePreference): void
  onOpenDownloads(): void
}

export function ProfilePanel({ theme, onThemeChange, onOpenDownloads }: ProfilePanelProps) {
  const [profile, setProfile] = useState(loadProfile)
  const [notice, setNotice] = useState<string | null>(null)

  const update = <K extends keyof LocalRiderProfile>(key: K, value: LocalRiderProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }))
  }

  const save = () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    localStorage.setItem("switchback:theme", theme)
    setNotice("Profile saved on this device.")
  }

  const exportData = () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), profile }, null, 2)
    const link = document.createElement("a")
    link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }))
    link.download = "switchback-local-profile.json"
    link.click()
    URL.revokeObjectURL(link.href)
    setNotice("Local profile export created.")
  }

  const deleteLocalSettings = () => {
    localStorage.removeItem(PROFILE_KEY)
    localStorage.removeItem("switchback:theme")
    setProfile(defaultProfile)
    onThemeChange("auto")
    setNotice("Local profile settings deleted. Saved routes and rides were not removed.")
  }

  return (
    <section className="destination-panel profile-panel" aria-labelledby="profile-title">
      <header>
        <span className="destination-kicker">No account required</span>
        <h1 id="profile-title"><UserCircle aria-hidden="true" /> Rider profile</h1>
        <p>Routing and motorcycle preferences stay in this browser.</p>
      </header>

      <div className="profile-grid">
        <label>Rider name<input aria-label="Rider name" value={profile.riderName} onChange={(event) => update("riderName", event.target.value)} /></label>
        <label>Motorcycle<input aria-label="Motorcycle" value={profile.motorcycleName} onChange={(event) => update("motorcycleName", event.target.value)} /></label>
        <label>Default route<select aria-label="Default route" value={profile.routingDefault} onChange={(event) => update("routingDefault", event.target.value as LocalRiderProfile["routingDefault"])}><option value="quick">Quick</option><option value="twisty">Twisty</option><option value="scenic">Scenic</option><option value="adventure">Adventure</option></select></label>
        <label>Fuel range<input aria-label="Fuel range in miles" type="number" min="30" max="500" value={profile.fuelRangeMiles} onChange={(event) => update("fuelRangeMiles", Number(event.target.value))} /></label>
        <label>Gravel tolerance<select aria-label="Gravel tolerance" value={profile.gravelTolerance} onChange={(event) => update("gravelTolerance", event.target.value as LocalRiderProfile["gravelTolerance"])}><option value="none">Paved only</option><option value="maintained">Maintained gravel</option><option value="all">Any legal surface</option></select></label>
        <label>Units<select aria-label="Units" value={profile.units} onChange={(event) => update("units", event.target.value as LocalRiderProfile["units"])}><option value="imperial">Miles / mph</option><option value="metric">Kilometers / km/h</option></select></label>
        <label>Theme<select aria-label="Theme" value={theme} onChange={(event) => onThemeChange(event.target.value as ThemePreference)}><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label>Map style<select aria-label="Map style" value={profile.mapPreference} onChange={(event) => update("mapPreference", event.target.value as LocalRiderProfile["mapPreference"])}><option value="clean">Clean</option><option value="explorer">Explorer</option><option value="night">Night</option></select></label>
        <label className="profile-check"><input type="checkbox" checked={profile.voice} onChange={(event) => update("voice", event.target.checked)} /> Voice guidance</label>
      </div>

      <button type="button" className="profile-storage-entry" aria-label="Manage offline downloads" onClick={onOpenDownloads}><HardDrives aria-hidden="true" /><span><strong>Manage offline downloads</strong><small>Regions, updates, storage, and attribution</small></span></button>

      <div className="profile-actions">
        <button type="button" className="primary-action" onClick={save}>Save profile</button>
        <button type="button" onClick={exportData}><DownloadSimple aria-hidden="true" /> Export local settings</button>
        <button type="button" className="danger-action" onClick={deleteLocalSettings}><Trash aria-hidden="true" /> Delete local settings</button>
      </div>
      {notice ? <p role="status" className="profile-notice">{notice}</p> : null}
    </section>
  )
}
