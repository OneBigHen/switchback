"use client"

import { ArrowCounterClockwise, ArrowsOutSimple, Eraser, Signpost } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import {
  MUST_LOCK_UNRESOLVED_OPTIONS,
  type MustLockUnresolvedOption,
  type RoadLockSatisfaction
} from "@/lib/roads/road-locks"
import type { PlannedRoute } from "@/lib/routing/types"
import "@/app/styles/must-lock-unresolved-panel.css"

export interface MustLockUnresolvedPanelProps {
  /** The satisfaction row that describes the unresolved must-lock. */
  satisfaction: RoadLockSatisfaction
  /** Display name of the lock; falls back to "This corridor" when absent. */
  displayName?: string
  /**
   * The previous planned route. The planner must never overwrite a
   * rider's plan when a must-lock fails, so this panel always surfaces
   * the previous route alongside the recovery options.
   */
  previousRoute: PlannedRoute | null
  onResolve(option: MustLockUnresolvedOption): void
  onDismiss(): void
}

const OPTION_META: Record<MustLockUnresolvedOption, { label: string; description: string; icon: typeof ArrowsOutSimple }> = {
  "try-wider-match": {
    label: "Try a wider match",
    description: "Loosen the fallback corridor and reroute.",
    icon: ArrowsOutSimple
  },
  "convert-to-prefer": {
    label: "Convert to Prefer",
    description: "Reward the corridor without blocking reroutes.",
    icon: Signpost
  },
  "remove-lock": {
    label: "Remove lock",
    description: "Delete the lock and plan with the previous route.",
    icon: Eraser
  },
  "restore-previous-route": {
    label: "Restore previous route",
    description: "Discard this attempt and return to the previous route.",
    icon: ArrowCounterClockwise
  }
}

export function MustLockUnresolvedPanel({
  satisfaction,
  displayName,
  previousRoute,
  onResolve,
  onDismiss
}: MustLockUnresolvedPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<MustLockUnresolvedOption | null>(null)
  const name = displayName?.trim() || "This corridor"

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const reason = satisfaction.match.kind === "unresolved" ? satisfaction.match.reason : ""
  const previousName = previousRoute?.name ?? "previous route"

  return (
    <section
      ref={panelRef}
      className="must-lock-unresolved-panel"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="must-lock-unresolved-title"
      aria-describedby="must-lock-unresolved-reason"
      tabIndex={-1}
    >
      <header>
        <span className="eyebrow">Must-use road lock could not be included</span>
        <h2 id="must-lock-unresolved-title">{name} could not be included.</h2>
        {reason ? <p id="must-lock-unresolved-reason">{reason}</p> : null}
      </header>
      <p className="must-lock-previous-route">
        Keeping <strong>{previousName}</strong> visible. Switchback did not overwrite it.
      </p>
      <ul className="must-lock-options">
        {MUST_LOCK_UNRESOLVED_OPTIONS.map((option) => {
          const meta = OPTION_META[option]
          const Icon = meta.icon
          const isPending = pending === option
          return (
            <li key={option}>
              <button
                type="button"
                className={`must-lock-option${isPending ? " is-pending" : ""}`}
                aria-pressed={isPending}
                disabled={pending !== null && !isPending}
                onClick={() => {
                  setPending(option)
                  onResolve(option)
                }}
              >
                <span className="must-lock-option-icon"><Icon aria-hidden="true" /></span>
                <span>
                  <strong>{meta.label}</strong>
                  <small>{meta.description}</small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" className="must-lock-dismiss" onClick={onDismiss}>Dismiss</button>
    </section>
  )
}
