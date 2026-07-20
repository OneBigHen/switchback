"use client"

import { memo } from "react"

export interface AriaLiveRegionProps {
  id: string
  politeness: "off" | "polite" | "assertive"
  message: string | null
}

export const AriaLiveRegion = memo(function AriaLiveRegion({ id, politeness, message }: AriaLiveRegionProps) {
  const role = politeness === "assertive" ? "alert" : politeness === "polite" ? "status" : null
  const ariaLive = politeness === "off" ? undefined : politeness

  return (
    <div
      id={id}
      role={role ?? undefined}
      aria-live={ariaLive}
      aria-atomic={ariaLive ? true : undefined}
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
        border: 0
      }}
    >
      {message ?? ""}
    </div>
  )
}, (prev, next) => prev.message === next.message && prev.politeness === next.politeness && prev.id === next.id)
