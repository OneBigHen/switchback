import styles from "../graphics.module.css"

export function GravelIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5h16M7 5l-2 14M17 5l2 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="13" cy="13" r="1.2" fill="currentColor" />
      <circle cx="10" cy="17" r=".9" fill="currentColor" />
      <circle cx="15" cy="8" r=".8" fill="currentColor" />
    </svg>
  )
}
