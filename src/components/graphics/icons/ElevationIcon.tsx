import styles from "../graphics.module.css"

export function ElevationIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 19l6-10 3 5 3-4 6 9H3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 9l1.2 2H7.8L9 9Z" fill="currentColor" />
    </svg>
  )
}
