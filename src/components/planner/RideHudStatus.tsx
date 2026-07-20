"use client"

interface RideHudStatusProps {
  eyebrow: string
  heading: string
  detail: string
  bikeProfileLabel?: string | null
  headlinePercent?: number | null
}

export function RideHudStatus({ eyebrow, heading, detail, bikeProfileLabel, headlinePercent }: RideHudStatusProps) {
  const showStrip = bikeProfileLabel != null || headlinePercent != null
  return (
    <>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{heading}</h2>
      <p>{detail}</p>
      {showStrip ? (
        <div className="ride-hud-status-strip" aria-label="Ride status strip">
          {bikeProfileLabel ? (
            <span className="ride-hud-status-bike" data-label={bikeProfileLabel}>
              <strong>{bikeProfileLabel}</strong>
              <small>bike</small>
            </span>
          ) : null}
          {headlinePercent != null ? (
            <span className="ride-hud-status-quality" data-tier={headlineTier(headlinePercent)}>
              <strong>{headlinePercent}%</strong>
              <small>data quality</small>
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

function headlineTier(percent: number): "strong" | "warn" | "weak" {
  if (percent >= 90) return "strong"
  if (percent >= 70) return "warn"
  return "weak"
}
