"use client"

import { WarningCircle } from "@phosphor-icons/react"
import { describePreferSkipReason, type RoadLockSatisfaction } from "@/lib/roads/road-locks"
import "@/app/styles/road-lock-satisfaction-badge.css"

export interface RoadLockSatisfactionBadgeProps {
  satisfaction: RoadLockSatisfaction
  displayName?: string
}

export function RoadLockSatisfactionBadge({ satisfaction, displayName }: RoadLockSatisfactionBadgeProps) {
  if (!satisfaction.skippedReason) return null
  const reason = describePreferSkipReason(satisfaction.skippedReason)
  const label = displayName?.trim() || "This route"
  return (
    <aside
      className="road-lock-satisfaction-badge"
      role="note"
      aria-label={`Preferred road skipped on ${label}`}
    >
      <WarningCircle aria-hidden="true" weight="fill" />
      <span>{reason}</span>
    </aside>
  )
}
