"use client"

import { ArrowRight, Motorcycle } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { getActiveBike, type RiderSettings } from "@/lib/settings/rider-settings"
import styles from "./SettingsSurface.module.css"

function categoryLabel(category: string): string {
  return category.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

export interface SettingsSurfaceProps {
  settings: RiderSettings
  onChangeBike(): void
  onEditBike(): void
  children?: ReactNode
}

export function SettingsSurface({ settings, onChangeBike, onEditBike, children }: SettingsSurfaceProps) {
  const activeBike = getActiveBike(settings)

  return (
    <section className={styles.surface} role="region" aria-label="Settings">
      <header className={styles.header}>
        <span>Rider setup</span>
        <h1>Settings</h1>
      </header>

      <section className={styles.bikeSection} aria-label="Active bike">
        <header><strong>Bike & routing</strong><small>Used for route and surface decisions</small></header>
        <article className={styles.bikeCard}>
          <span className={styles.bikeIcon} aria-hidden="true"><Motorcycle weight="fill" /></span>
          <span className={styles.bikeIdentity}>
            <strong>{activeBike.name}</strong>
            <span>{categoryLabel(activeBike.category)} · {Math.round(activeBike.fuelRangeMiles)} mi range</span>
            <small>{activeBike.maintainedGravel ? "Gravel capable" : "Paved-road setup"}{activeBike.roughTracks ? " · rough tracks enabled" : ""}</small>
          </span>
          <button type="button" aria-label={`Edit ${activeBike.name}`} onClick={onEditBike}>Edit</button>
        </article>
        <button type="button" className={styles.changeBike} aria-label="Change active bike" onClick={onChangeBike}>
          <span>Change active bike</span>
          <ArrowRight weight="bold" aria-hidden="true" />
        </button>
      </section>

      {children ? <div className={styles.sections}>{children}</div> : null}
    </section>
  )
}
