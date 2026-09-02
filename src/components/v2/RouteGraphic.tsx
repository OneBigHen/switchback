import styles from "./RouteGraphic.module.css"

export type RouteGraphicVariant = "route" | "bike" | "library"

export interface RouteGraphicProps {
  seed: string
  variant: RouteGraphicVariant
  label?: string
  className?: string
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function sample(hash: number, index: number): number {
  let value = (hash + Math.imul(index + 1, 0x9e3779b1)) >>> 0
  value ^= value >>> 16
  value = Math.imul(value, 0x7feb352d) >>> 0
  value = (value ^ (value >>> 15)) >>> 0
  return value / 0xffffffff
}

function routePath(seed: string): { path: string; startY: number } {
  const hash = hashSeed(seed)
  const x = [5, 19, 33, 48, 63, 78, 95]
  const y = x.map((_, index) => 14 + Math.round(sample(hash, index) * 54))
  return {
    path: x.map((point, index) => `${index === 0 ? "M" : "L"}${point} ${y[index]}`).join(" "),
    startY: y[0] ?? 40
  }
}

export function RouteGraphic({ seed, variant, label, className }: RouteGraphicProps) {
  const labelled = Boolean(label)
  const classes = [styles.graphic, styles[variant], className].filter(Boolean).join(" ")
  const route = routePath(`${seed}:${variant}`)

  return (
    <svg
      className={classes}
      viewBox="0 0 100 80"
      preserveAspectRatio="none"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : "true"}
      focusable="false"
      data-route-graphic={variant}
    >
      <path className={styles.topo} d="M-8 58 C12 42 26 71 47 51 S78 33 108 48" />
      <path className={styles.topoSecondary} d="M-6 28 C15 13 31 41 50 29 S80 10 106 24" />
      <path className={styles.traceHalo} d={route.path} />
      <path className={styles.trace} d={route.path} data-route-trace="true" />
      <circle className={styles.start} cx="5" cy={route.startY} r="2.6" />
    </svg>
  )
}
