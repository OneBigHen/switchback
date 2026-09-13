"use client"

import type { PlanMode } from "../PlannerDeckViewModel"

export interface PlanModeSelectorProps {
  value: PlanMode
  onChange(mode: PlanMode): void
  /** Starts the current free-ride behaviour; omitted where it is unavailable. */
  onStartFreeRide?(): void
  disabled?: boolean
}

/**
 * One mode family: `To | Loop | Free Ride`.
 *
 * A rider asks "what kind of ride is this?" once, and the answer has three
 * shapes. Splitting Free Ride out into its own permanent button beside a
 * Destination/Loop pair made it read as a different kind of thing, and cost a
 * second row of scarce phone space to say so.
 *
 * To and Loop are persistent trip shape, so they carry `aria-pressed`. Free
 * Ride starts a mode that takes the whole surface over rather than settling
 * into planner state, so it is an ordinary button: claiming a pressed state it
 * can never be observed in would be a lie to a screen reader.
 */
export function PlanModeSelector({ value, onChange, onStartFreeRide, disabled = false }: PlanModeSelectorProps) {
  return (
    <div className="plan-v2__mode-selector" role="group" aria-label="Trip shape">
      <button
        type="button"
        className={value === "destination" ? "is-selected" : undefined}
        aria-pressed={value === "destination"}
        disabled={disabled}
        onClick={() => onChange("destination")}
      >
        To
      </button>
      <button
        type="button"
        className={value === "loop" ? "is-selected" : undefined}
        aria-pressed={value === "loop"}
        disabled={disabled}
        onClick={() => onChange("loop")}
      >
        Loop
      </button>
      {onStartFreeRide ? (
        <button
          type="button"
          className="plan-v2__mode-free-ride"
          disabled={disabled}
          onClick={onStartFreeRide}
        >
          Free Ride
        </button>
      ) : null}
    </div>
  )
}
