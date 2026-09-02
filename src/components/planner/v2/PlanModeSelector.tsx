"use client"

import { PencilLine } from "@phosphor-icons/react"
import type { PlanMode } from "../PlannerDeckViewModel"

export interface PlanModeSelectorProps {
  value: PlanMode
  onChange(mode: PlanMode): void
  onDraw(): void
  disabled?: boolean
}

/**
 * Trip shape is deliberately separate from route personality. Draw is an
 * action that hands control to the existing map sketch surface, rather than a
 * third routing profile or a second planner state machine.
 */
export function PlanModeSelector({ value, onChange, onDraw, disabled = false }: PlanModeSelectorProps) {
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
      <button
        type="button"
        className="plan-v2__draw-mode"
        aria-pressed={false}
        disabled={disabled}
        onClick={onDraw}
      >
        <PencilLine aria-hidden="true" />
        Draw
      </button>
    </div>
  )
}
