"use client"

import { GearSix } from "@phosphor-icons/react"

interface SettingsLauncherProps {
  onOpen(): void
}

/**
 * Secondary settings entry point. Settings is deliberately not a primary
 * destination; this launcher is the only way into it from the shell.
 */
export function SettingsLauncher({ onOpen }: SettingsLauncherProps) {
  return (
    <button type="button" className="app-navigation-settings" onClick={onOpen}>
      <GearSix aria-hidden="true" />
      <span>Settings</span>
    </button>
  )
}
