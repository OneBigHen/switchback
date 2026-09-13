"use client"

import type { MapTrifold } from "@phosphor-icons/react"
import { OpenGravelMark } from "@/components/brand/OpenGravelMark"
import { PRODUCT_BRAND } from "@/lib/brand/product-brand"
import type { PrimaryDestination } from "@/lib/client/app-navigation"
import { PRIMARY_NAV_ITEMS, RECORD_NAV_ITEM } from "./primary-nav-items"

/**
 * The approved mobile model, in order: `Plan · Explore · Saved · Record ·
 * Settings`.
 *
 * Four of those are places the rider can *be*; Record starts a task. That
 * distinction is real — it decides whether selecting the item changes the URL
 * and the back stack — so Record keeps its activity marking even though it
 * sits in the same bar at the same weight.
 */

interface AppNavigationProps {
  activeDestination: PrimaryDestination
  onSelect(destination: PrimaryDestination): void
  onOpenRecord(): void
}

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
        {PRIMARY_NAV_ITEMS.map(({ destination, label, icon: Icon }) => (
          <NavItem
            key={destination}
            label={label}
            icon={Icon}
            active={activeDestination === destination}
            onClick={() => onSelect(destination)}
          />
        ))}
        <NavItem
          label={RECORD_NAV_ITEM.label}
          icon={RECORD_NAV_ITEM.icon}
          active={false}
          cluster="secondary"
          onClick={onOpenRecord}
        />
      </div>
    </nav>
  )
}

interface NavItemProps {
  label: string
  icon: typeof MapTrifold
  active: boolean
  cluster?: "secondary"
  onClick(): void
}

function NavItem({ label, icon: Icon, active, cluster, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      className={active ? "is-active" : undefined}
      aria-current={active ? "page" : undefined}
      data-nav-cluster={cluster}
      data-nav-item={label.toLowerCase()}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}
