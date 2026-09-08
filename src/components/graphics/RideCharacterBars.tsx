import type { ComponentType } from "react"
import { clamp01 } from "./graphics-math"
import styles from "./graphics.module.css"
import {
  ElevationIcon,
  GravelIcon,
  HighwayAvoidanceIcon,
  SceneryIcon,
  TechnicalityIcon,
  TwistinessIcon
} from "./icons"

export type RideCharacterAxis =
  | "twistiness"
  | "scenery"
  | "gravel"
  | "technicality"
  | "elevation"
  | "highwayAversion"

export interface RideCharacterValue {
  axis: RideCharacterAxis
  value: number | null
  previousValue?: number | null
  evidenceCount?: number
}

export interface RideCharacterBarsProps {
  values: ReadonlyArray<RideCharacterValue>
  label?: string
}

const AXES: Record<RideCharacterAxis, { label: string; Icon: ComponentType }> = {
  twistiness: { label: "Curves", Icon: TwistinessIcon },
  scenery: { label: "Scenery", Icon: SceneryIcon },
  gravel: { label: "Gravel", Icon: GravelIcon },
  technicality: { label: "Technical", Icon: TechnicalityIcon },
  elevation: { label: "Elevation", Icon: ElevationIcon },
  highwayAversion: { label: "Avoid highways", Icon: HighwayAvoidanceIcon }
}

function score(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const clamped = clamp01(value)
  return clamped === null ? null : Math.round(clamped * 100)
}

export function RideCharacterBars({ values, label = "Ride character" }: RideCharacterBarsProps) {
  return (
    <div className={styles.characterRoot} role="group" aria-label={label}>
      {values.map((item, index) => {
        const meta = AXES[item.axis]
        const current = score(item.value)
        const previous = score(item.previousValue)
        const evidenceCount = Number.isFinite(item.evidenceCount)
          ? Math.max(0, Math.round(item.evidenceCount as number))
          : null
        const Icon = meta.Icon
        return (
          <div className={styles.characterRow} key={`${item.axis}-${index}`} data-character-axis={item.axis}>
            <Icon />
            <span className={styles.characterLabel}>
              <strong>{meta.label}</strong>
              <span className={styles.characterTrack} aria-hidden="true">
                {current === null ? null : <span className={styles.characterFill} style={{ width: `${current}%` }} />}
              </span>
            </span>
            <span className={styles.characterValue}>
              {current === null ? (
                <span className={styles.characterUnknown}>Still learning</span>
              ) : previous === null ? (
                current
              ) : (
                <span className={styles.characterTransition}>{previous} → {current}</span>
              )}
              {evidenceCount !== null ? <small> · {evidenceCount} rides</small> : null}
            </span>
          </div>
        )
      })}
    </div>
  )
}
