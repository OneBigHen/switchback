"use client"

import { ArrowRight, GasPump, Mountains, Motorcycle } from "@phosphor-icons/react"
import type { ReactNode } from "react"
import { getActiveBike, type RiderSettings } from "@/lib/settings/rider-settings"
import { DestinationHeader } from "@/components/v2/DestinationHeader"
import { RouteGraphic } from "@/components/v2/RouteGraphic"
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
  const capability = activeBike.roughTracks
    ? "Rough tracks enabled"
    : activeBike.maintainedGravel
      ? "Maintained gravel"
      : "Paved-road setup"

  return (
    <section className={styles.surface} role="region" aria-label="Settings">
      <DestinationHeader
        eyebrow="Rider setup"
        title="Settings"
        description="Tune the motorcycle, route defaults, and controls Switchback uses every time you plan or ride."
        graphic={<RouteGraphic seed={activeBike.id} variant="bike" />}
      />

      <section className={styles.bikeSection} aria-label="Active motorcycle">
        <header className={styles.sectionHeading}>
          <div>
            <span>Routing identity</span>
            <h2>Your motorcycle</h2>
          </div>
          <small>Surface and range limits feed directly into route decisions.</small>
        </header>

        <article className={styles.bikeCard}>
          <div className={styles.bikeIdentityBlock}>
            <span className={styles.bikeIcon} aria-hidden="true"><Motorcycle weight="fill" /></span>
            <span className={styles.bikeIdentity}>
              <small>Active bike</small>
              <strong>{activeBike.name}</strong>
              <span>{categoryLabel(activeBike.category)}</span>
            </span>
          </div>

          <div className={styles.bikeMetrics} aria-label="Bike routing capabilities">
            <span><GasPump aria-hidden="true" /><b>{Math.round(activeBike.fuelRangeMiles)}</b><small>mi range</small></span>
            <span><Mountains aria-hidden="true" /><b>{capability}</b><small>surface policy</small></span>
          </div>

          <div className={styles.bikeActions}>
            <button type="button" className={styles.primaryAction} aria-label={`Edit ${activeBike.name}`} onClick={onEditBike}>Edit bike</button>
            <button type="button" className={styles.secondaryAction} aria-label="Change active bike" onClick={onChangeBike}>
              <span>Change</span><ArrowRight weight="bold" aria-hidden="true" />
            </button>
          </div>
        </article>
      </section>

      {children ? <div className={styles.sections}>{children}</div> : null}
    </section>
  )
}
