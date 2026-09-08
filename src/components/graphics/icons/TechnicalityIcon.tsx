import styles from "../graphics.module.css"

export function TechnicalityIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 18h4v-4h4v-4h4V6h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6" cy="8" r="1.2" fill="currentColor" />
      <circle cx="18" cy="17" r="1.2" fill="currentColor" />
    </svg>
  )
}
