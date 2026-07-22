"use client"

import { FolderSimple, MapTrifold, Record, UserCircle } from "@phosphor-icons/react"
import type { AppTab } from "@/lib/client/app-navigation"

const items: Array<{
  tab: AppTab
  label: string
  icon: typeof MapTrifold
}> = [
  { tab: "plan", label: "Plan", icon: MapTrifold },
  { tab: "library", label: "Library", icon: FolderSimple },
  { tab: "record", label: "Record", icon: Record },
  { tab: "profile", label: "Profile", icon: UserCircle }
]

interface AppNavigationProps {
  activeTab: AppTab
  onSelect(tab: AppTab): void
}

export function AppNavigation({ activeTab, onSelect }: AppNavigationProps) {
  return (
    <nav className="app-navigation" aria-label="Primary">
      <div className="app-navigation-brand" aria-label="Switchback">
        <span className="switchback-mark" aria-hidden="true">
          <svg viewBox="0 0 44 44" focusable="false">
            <path d="M9 12h17c5 0 8 2 8 6s-3 6-8 6H18c-5 0-8 2-8 7s4 7 9 7h16" />
            <path d="m28 8 6 4-6 4M16 28l-6 4 6 4" />
          </svg>
        </span>
        <span><strong>Switchback</strong><small>Premium motorcycle routing</small></span>
      </div>
      <div className="app-navigation-items">
        {items.map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "is-active" : undefined}
            aria-current={activeTab === tab ? "page" : undefined}
            onClick={() => onSelect(tab)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
