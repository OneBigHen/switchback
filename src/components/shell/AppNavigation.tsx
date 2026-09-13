"use client"

import { Compass, GearSix, MapTrifold, Path, Record } from "@phosphor-icons/react"
import { OpenGravelMark } from "@/components/brand/OpenGravelMark"
import { PRODUCT_BRAND } from "@/lib/brand/product-brand"
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
}

/**
 * Primary navigation owns OpenGravel's four persistent destinations. Record is
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
        <OpenGravelMark className="open-gravel-mark" />
        <span>
          <strong>{PRODUCT_BRAND.name}</strong>
          <small>Gravel &amp; backroad routing</small>
        </span>
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
