"use client"

import { Compass, MapTrifold, Path, Record } from "@phosphor-icons/react"
import type { PrimaryDestination } from "@/lib/client/app-navigation"
import { SettingsLauncher } from "./SettingsLauncher"

const destinations: Array<{
  destination: PrimaryDestination
  label: string
  icon: typeof MapTrifold
}> = [
  { destination: "plan", label: "Plan", icon: MapTrifold },
  { destination: "rides", label: "Rides", icon: Path },
  { destination: "discover", label: "Discover", icon: Compass }
]

interface AppNavigationProps {
  activeDestination: PrimaryDestination
  onSelect(destination: PrimaryDestination): void
  onOpenRecord(): void
  onOpenSettings(): void
}

/**
 * Primary navigation: exactly the three V2 destinations. Recording is an
 * activity and Settings a secondary launcher — both live in the secondary
 * cluster and never appear as primary items.
 */
export function AppNavigation({
  activeDestination,
  onSelect,
  onOpenRecord,
  onOpenSettings
}: AppNavigationProps) {
  return (
    <nav className="app-navigation" aria-label="Primary">
      <div className="app-navigation-brand">
        <span className="switchback-mark" aria-hidden="true">
          <svg viewBox="0 0 44 44" focusable="false">
            <path d="M9 12h17c5 0 8 2 8 6s-3 6-8 6H18c-5 0-8 2-8 7s4 7 9 7h16" />
            <path d="m28 8 6 4-6 4M16 28l-6 4 6 4" />
          </svg>
        </span>
        <span><strong>Switchback</strong><small>Motorcycle routing</small></span>
      </div>
      <div className="app-navigation-primary" role="group" aria-label="Primary destinations">
        {destinations.map(({ destination, label, icon: Icon }) => (
          <button
            key={destination}
            type="button"
            className={activeDestination === destination ? "is-active" : undefined}
            aria-current={activeDestination === destination ? "page" : undefined}
            onClick={() => onSelect(destination)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="app-navigation-secondary" data-nav-cluster="secondary">
        <button type="button" onClick={onOpenRecord}>
          <Record aria-hidden="true" />
          <span>Record</span>
        </button>
        <SettingsLauncher onOpen={onOpenSettings} />
      </div>
    </nav>
  )
}
