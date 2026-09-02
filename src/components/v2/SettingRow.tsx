import type { ReactNode } from "react"
import styles from "./SettingRow.module.css"

export interface SettingRowProps {
  title: string
  description?: string
  children: ReactNode
  danger?: boolean
}

export function SettingRow({ title, description, children, danger = false }: SettingRowProps) {
  return (
    <div
      className={danger ? `${styles.row} ${styles.danger}` : styles.row}
      role="group"
      aria-label={title}
      data-setting-row="true"
    >
      <div className={styles.copy}>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <div className={styles.control}>{children}</div>
    </div>
  )
}
