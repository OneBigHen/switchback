"use client"

import type { PlanMode } from "../PlannerDeckViewModel"

export interface PlanModeSelectorProps {
  value: PlanMode
  onChange(mode: PlanMode): void
  disabled?: boolean
}

/**
 * Trip shape is persistent planner state. One-shot route-making tools such as
 * Draw and Free Ride deliberately live beside this selector rather than inside
 * it, so the rider can tell "what kind of trip is this?" from "what do I want
 * to do to the map?" at a glance.
 */
export function PlanModeSelector({ value, onChange, disabled = false }: PlanModeSelectorProps) {
  return (
    <div className="plan-v2__mode-selector" role="group" aria-label="Trip shape">
      <button
        type="button"
        className={value === "destination" ? "is-selected" : undefined}
        aria-pressed={value === "destination"}
        disabled={disabled}
        onClick={() => onChange("destination")}
      >
        Destination
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
    </div>
  )
}
