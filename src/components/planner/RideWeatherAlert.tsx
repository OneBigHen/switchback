"use client"

import { Warning, X } from "@phosphor-icons/react"
import type { RouteWeatherAlert } from "@/lib/weather/types"

interface RideWeatherAlertProps {
  alert: RouteWeatherAlert
  onDismiss(): void
}

/**
 * Pure display component for an active NWS weather alert on the ride HUD.
 *
 * Receives the alert payload plus a dismiss callback; no effects, no storage,
 * no browser APIs. RideHud owns dismissal state (so it can persist across
 * reloads) and passes the dismiss handler down.
 */
export function RideWeatherAlert({ alert, onDismiss }: RideWeatherAlertProps) {
  return (
    <aside className="ride-alert-tray" role="alert">
      <Warning weight="fill" aria-hidden="true" />
      <span>
        <strong>{alert.event}</strong>
        <small>{alert.headline}</small>
      </span>
      <button
        type="button"
        className="ride-alert-dismiss"
        aria-label={`Dismiss ${alert.event}`}
        onClick={onDismiss}
      >
        <X aria-hidden="true" />
      </button>
    </aside>
  )
}
