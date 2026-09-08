import { clamp01 } from "./graphics-math"
import styles from "./graphics.module.css"

export interface EvidenceMeterProps {
  value: number | null
  label: string
  detail?: string
}

export function EvidenceMeter({ value, label, detail }: EvidenceMeterProps) {
  const normalized = value === null ? null : clamp01(value)
  const percent = normalized === null ? null : Math.round(normalized * 100)

  return (
    <div className={styles.evidenceRoot} data-evidence-state={percent === null ? "unknown" : "quantified"}>
      <span><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</span>
      <div
        className={styles.evidenceTrack}
        role={percent === null ? undefined : "progressbar"}
        aria-label={percent === null ? undefined : label}
        aria-valuemin={percent === null ? undefined : 0}
        aria-valuemax={percent === null ? undefined : 100}
        aria-valuenow={percent ?? undefined}
      >
        {percent === null ? null : <span style={{ width: `${percent}%` }} />}
      </div>
      <span>{percent === null ? "Unknown" : `${percent}%`}</span>
    </div>
  )
}
