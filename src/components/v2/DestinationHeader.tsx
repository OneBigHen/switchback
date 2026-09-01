import type { ReactNode } from "react"
import styles from "./DestinationHeader.module.css"

export interface DestinationHeaderProps {
  eyebrow: string
  title: string
  description?: string
  graphic?: ReactNode
  actions?: ReactNode
}

export function DestinationHeader({ eyebrow, title, description, graphic, actions }: DestinationHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {graphic ? <div className={styles.graphic}>{graphic}</div> : null}
    </header>
  )
}
