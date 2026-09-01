"use client"

import { ArrowDown, ArrowUp, CaretDown, DotsSixVertical } from "@phosphor-icons/react"
import { useState } from "react"
import { layerCatalog } from "@/lib/client/map-layers"
import {
  defaultRiderUiPreferences,
  type PlanQuickActionId,
  type RecordingMetricId,
  type RideMetricId,
  type RiderUiPreferences,
  type RouteDetailModuleId
} from "@/lib/settings/rider-settings"
import styles from "./UiCustomizationSettings.module.css"

const PLAN_LABELS: Record<PlanQuickActionId, string> = {
  "free-ride": "Free Ride",
  record: "Record",
  "home-loop": "Home loop",
  "saved-place": "Saved place"
}
const RIDE_METRIC_LABELS: Record<RideMetricId, string> = {
  eta: "ETA",
  "remaining-distance": "Remaining distance",
  speed: "Speed",
  elevation: "Elevation",
  elapsed: "Elapsed"
}
const RECORDING_METRIC_LABELS: Record<RecordingMetricId, string> = {
  distance: "Distance",
  speed: "Speed",
  elevation: "Elevation",
  elapsed: "Elapsed"
}
const ROUTE_DETAIL_LABELS: Record<RouteDetailModuleId, string> = {
  overview: "Overview",
  "road-character": "Road character",
  "surface-elevation": "Surface & elevation",
  weather: "Weather & alerts",
  traffic: "Traffic & timing",
  stops: "Stops / fuel / daylight",
  directions: "Directions",
  offline: "Offline",
  actions: "Start & actions",
  evidence: "Evidence & data",
  trip: "Trip stages",
  "rating-publish": "Rating / publish"
}
const REQUIRED_ROUTE_DETAILS = new Set<RouteDetailModuleId>(["overview", "actions"])

function moved<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  return next
}

interface ReorderListProps<T extends string> {
  label: string
  items: T[]
  itemLabel(item: T): string
  onChange(items: T[]): void
}

function ReorderList<T extends string>({ label, items, itemLabel, onChange }: ReorderListProps<T>) {
  return (
    <section className={styles.group} role="group" aria-label={label}>
      <header><strong>{label}</strong><small>{items.length} shown</small></header>
      <ol>
        {items.map((item, index) => {
          const readable = itemLabel(item)
          return (
            <li key={item}>
              <DotsSixVertical className={styles.grip} aria-hidden="true" />
              <span>{readable}</span>
              <button type="button" aria-label={`Move ${readable} earlier`} disabled={index === 0} onClick={() => onChange(moved(items, index, -1))}>
                <ArrowUp aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Move ${readable} later`} disabled={index === items.length - 1} onClick={() => onChange(moved(items, index, 1))}>
                <ArrowDown aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export interface UiCustomizationSettingsProps {
  value: RiderUiPreferences
  onChange(value: RiderUiPreferences): void
}

export function UiCustomizationSettings({ value, onChange }: UiCustomizationSettingsProps) {
  const [expanded, setExpanded] = useState(false)
  const patch = <K extends keyof RiderUiPreferences>(key: K, next: RiderUiPreferences[K]) => {
    onChange({ ...value, [key]: next })
  }
  const layerName = (id: RiderUiPreferences["quickLayers"][number]) => (
    layerCatalog.find((layer) => layer.id === id)?.name ?? id
  )

  return (
    <section className={styles.customize} aria-label="Customize Switchback">
      <header className={styles.heading}>
        <div>
          <span>Curated controls</span>
          <h2>Customize</h2>
          <p>Choose what is easiest to reach. Safety-critical riding controls stay fixed.</p>
        </div>
        <button
          type="button"
          className={styles.toggleButton}
          aria-expanded={expanded}
          aria-controls="ui-customization-controls"
          onClick={() => setExpanded((open) => !open)}
        >
          <span>Customize controls</span>
          <CaretDown aria-hidden="true" />
        </button>
      </header>

      {expanded ? (
        <div id="ui-customization-controls" className={styles.controls}>
          <div className={styles.resetRow}>
            <button className={styles.resetButton} type="button" onClick={() => onChange(defaultRiderUiPreferences())}>
              Reset to Switchback defaults
            </button>
          </div>

          <ReorderList label="Plan quick actions" items={value.planQuickActions} itemLabel={(id) => PLAN_LABELS[id]} onChange={(next) => patch("planQuickActions", next)} />
          <ReorderList label="Quick layers" items={value.quickLayers} itemLabel={layerName} onChange={(next) => patch("quickLayers", next)} />
          <ReorderList label="Ride HUD metrics" items={value.rideMetrics} itemLabel={(id) => RIDE_METRIC_LABELS[id]} onChange={(next) => patch("rideMetrics", next)} />
          <ReorderList label="Recording metrics" items={value.recordingMetrics} itemLabel={(id) => RECORDING_METRIC_LABELS[id]} onChange={(next) => patch("recordingMetrics", next)} />

          <section className={styles.group} role="group" aria-label="Route details">
            <header><strong>Route details</strong><small>Order and visibility</small></header>
            <ol>
              {value.routeDetailOrder.map((module, index) => {
                const label = ROUTE_DETAIL_LABELS[module]
                const required = REQUIRED_ROUTE_DETAILS.has(module)
                const visible = required || !value.hiddenRouteDetailModules.includes(module)
                return (
                  <li key={module}>
                    <DotsSixVertical className={styles.grip} aria-hidden="true" />
                    <label className={styles.visibility}>
                      <input
                        type="checkbox"
                        aria-label={`Show ${label}`}
                        checked={visible}
                        disabled={required}
                        onChange={(event) => {
                          const hidden = event.currentTarget.checked
                            ? value.hiddenRouteDetailModules.filter((id) => id !== module)
                            : [...value.hiddenRouteDetailModules, module]
                          patch("hiddenRouteDetailModules", hidden)
                        }}
                      />
                      <span>{label}</span>
                    </label>
                    <button type="button" aria-label={`Move ${label} earlier`} disabled={index === 0} onClick={() => patch("routeDetailOrder", moved(value.routeDetailOrder, index, -1))}>
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button type="button" aria-label={`Move ${label} later`} disabled={index === value.routeDetailOrder.length - 1} onClick={() => patch("routeDetailOrder", moved(value.routeDetailOrder, index, 1))}>
                      <ArrowDown aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>
      ) : null}
    </section>
  )
}
