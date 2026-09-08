import styles from "./graphics.module.css"

export type MotorcycleCategory = "street" | "touring" | "adventure" | "dual-sport"

export interface MotorcycleSilhouetteProps {
  category: MotorcycleCategory
  label?: string
  className?: string
}

const BODY_PATHS: Record<MotorcycleCategory, string> = {
  street: "M28 35h15l8-8h12l7 8h12l5 6H70l-7-5H45l-6 5H22l6-6Z",
  touring: "M24 35h18l8-11h16l8 11h11l6 6H69l-6-5H45l-6 5H19l5-6Zm29-18h15v8H53v-8Z",
  adventure: "M24 35h16l10-13h14l10 13h10l6 6H69l-6-6H45l-6 6H19l5-6Zm30-18h12l4 5H51l3-5Z",
  "dual-sport": "M22 35h18l11-15h12l11 15h11l5 6H68l-6-6H45l-7 6H18l4-6Zm31-19h11l5 5H49l4-5Z"
}

export function MotorcycleSilhouette({ category, label, className }: MotorcycleSilhouetteProps) {
  const labelled = Boolean(label?.trim())
  const classes = [styles.graphic, styles.motorcycle, className].filter(Boolean).join(" ")
  return (
    <svg
      className={classes}
      viewBox="0 0 108 64"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : "true"}
      focusable="false"
      data-motorcycle-category={category}
    >
      <circle cx="31" cy="45" r="11" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="79" cy="45" r="11" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d={BODY_PATHS[category]} fill="currentColor" opacity=".82" />
      <path d="M39 35l12 10h16l8-10M51 45l8-14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {category === "touring" ? <rect x="66" y="20" width="13" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
      {category === "adventure" || category === "dual-sport" ? <path d="M48 24h20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
      {category === "dual-sport" ? <path d="M25 29h16M73 29h13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
    </svg>
  )
}
