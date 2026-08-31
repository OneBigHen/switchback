"use client"

import { ArrowRight } from "@phosphor-icons/react"
import type { RideLibraryItem } from "./RidesSurface"
import styles from "./RidesSurface.module.css"

function dateLabel(value: string | null): string | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(parsed))
    : null
}

export interface RideListRowProps {
  item: RideLibraryItem
  onOpen(item: RideLibraryItem): void
}

export function RideListRow({ item, onOpen }: RideListRowProps) {
  const updated = dateLabel(item.updatedAt)
  return (
    <article className={styles.row} data-kind={item.kind}>
      <button type="button" aria-label={`Open ${item.name}`} onClick={() => onOpen(item)}>
        <span className={styles.identity}>
          <small>{item.sourceLabel}</small>
          <strong>{item.name}</strong>
          {item.tags.length > 0 ? <span>{item.tags.slice(0, 2).join(" · ")}</span> : null}
        </span>
        <span className={styles.metrics}>
          <b>{item.distanceMiles.toFixed(1)} mi</b>
          <span>{Math.round(item.durationMinutes)} min</span>
          {updated ? <small>{updated}</small> : null}
        </span>
        <ArrowRight weight="bold" aria-hidden="true" />
      </button>
    </article>
  )
}
