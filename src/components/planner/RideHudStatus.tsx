"use client"

/**
 * Pure display component for the ride-status heading/detail block.
 *
 * Receives pre-computed strings only; all status logic (navigation frame,
 * GPS state, recovery flags) stays in RideHud. The consumer renders this
 * inside the existing `<div role="status" aria-live="polite">` wrapper so
 * the continue/then cues and reroute/retry controls remain adjacent.
 */
interface RideHudStatusProps {
  eyebrow: string
  heading: string
  detail: string
}

export function RideHudStatus({ eyebrow, heading, detail }: RideHudStatusProps) {
  return (
    <>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{heading}</h2>
      <p>{detail}</p>
    </>
  )
}
