import styles from "./graphics.module.css"

export type ConfidenceLevel = "high" | "medium" | "low" | "unknown"

export interface ConfidenceBadgeProps {
  level: ConfidenceLevel
}

const LABELS: Record<ConfidenceLevel, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  unknown: "Unknown confidence"
}

export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  return (
    <span className={styles.confidenceBadge} data-confidence={level}>
      {LABELS[level]}
    </span>
  )
}
