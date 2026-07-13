"use client"

import {
  DownloadSimple,
  FloppyDisk,
  NavigationArrow
} from "@phosphor-icons/react"
import type { PlannedRoute } from "@/lib/routing/types"

interface RouteComparisonProps {
  routes: PlannedRoute[]
  selectedId: string
  onSelect(id: string): void
  onSave(route: PlannedRoute): void
  onExport(route: PlannedRoute): void
  onRide(route: PlannedRoute): void
}

function dominantMix(mix: Record<string, number>): string {
  const dominant = Object.entries(mix).sort((left, right) => right[1] - left[1])[0]
  if (!dominant) return "Road mix unavailable"
  return `${Math.round(dominant[1])}% ${dominant[0].replaceAll("_", " ")}`
}

export function RouteComparison({
  routes,
  selectedId,
  onSelect,
  onSave,
  onExport,
  onRide
}: RouteComparisonProps) {
  const selectedRoute = routes.find((route) => route.id === selectedId) ?? routes[0]
  if (!selectedRoute) return null

  return (
    <section className="route-rack" aria-labelledby="route-rack-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Route telemetry</span>
          <h2 id="route-rack-title">Choose your line</h2>
        </div>
        <span className="route-count">{routes.length.toString().padStart(2, "0")}</span>
      </div>

      <div className="route-slips">
        {routes.map((route, index) => {
          const selected = route.id === selectedId
          return (
            <button
              className={`route-slip${selected ? " is-selected" : ""}`}
              type="button"
              key={route.id}
              aria-label={`Select ${route.name}`}
              aria-pressed={selected}
              onClick={() => onSelect(route.id)}
            >
              <span className="route-slip-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="route-slip-name">
                <strong>{route.name}</strong>
                <small>{dominantMix(route.roadMix)}</small>
              </span>
              <span className="route-slip-metric">
                <strong>{route.distanceMiles.toFixed(1)}</strong>
                <small>miles</small>
              </span>
              <span className="route-slip-metric">
                <strong>{Math.round(route.durationMinutes)}</strong>
                <small>min</small>
              </span>
              <span className="route-slip-metric twistiness-meter">
                <strong>{Math.round(route.twistiness)}</strong>
                <small>twist</small>
              </span>
              {route.overlapPercent !== undefined && route.overlapPercent < 99 ? (
                <span className="route-overlap">{Math.round(route.overlapPercent)}% shared</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="route-actions" aria-label="Selected route actions">
        <button type="button" className="tool-button" onClick={() => onSave(selectedRoute)}>
          <FloppyDisk aria-hidden="true" />
          <span>Save route</span>
        </button>
        <button type="button" className="tool-button" onClick={() => onExport(selectedRoute)}>
          <DownloadSimple aria-hidden="true" />
          <span>Export GPX</span>
        </button>
        <button type="button" className="ride-button" onClick={() => onRide(selectedRoute)}>
          <NavigationArrow weight="fill" aria-hidden="true" />
          <span>Start ride</span>
        </button>
      </div>
    </section>
  )
}
