"use client"

import { Compass, GearSix, MapTrifold, Path, Record } from "@phosphor-icons/react"
import type { PrimaryDestination } from "@/lib/client/app-navigation"

const destinations: Array<{
  destination: PrimaryDestination
  label: string
  icon: typeof MapTrifold
}> = [
  { destination: "plan", label: "Plan", icon: MapTrifold },
  { destination: "rides", label: "Rides", icon: Path },
  { destination: "discover", label: "Discover", icon: Compass },
  { destination: "settings", label: "Settings", icon: GearSix }
]

interface AppNavigationProps {
  activeDestination: PrimaryDestination
  onSelect(destination: PrimaryDestination): void
  onOpenRecord(): void
  /** Temporary compatibility input while PlannerShell's old Settings overlay is removed. */
  onOpenSettings?(): void
}

/**
 * Primary navigation owns Switchback's four persistent destinations. Record is
 * intentionally separate because it starts a task rather than changing the
 * rider's top-level place in the application.
 */
export function AppNavigation({
  activeDestination,
  onSelect,
  onOpenRecord
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
      </div>
    </nav>
  )
}
