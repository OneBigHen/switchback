"use client"

import { ArrowCounterClockwise, Check, Trash, X } from "@phosphor-icons/react"
import styles from "./SketchRouteToolbar.module.css"

export interface SketchRouteToolbarProps {
  canUndo: boolean
  canFinish: boolean
  busy?: boolean
  onUndo(): void
  onClear(): void
  onDone(): void
  onCancel(): void
}

export function SketchRouteToolbar({
  canUndo,
  canFinish,
  busy = false,
  onUndo,
  onClear,
  onDone,
  onCancel
}: SketchRouteToolbarProps) {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Draw route controls" aria-busy={busy || undefined}>
      <button type="button" className={styles.secondary} aria-label="Undo drawing point" disabled={busy || !canUndo} onClick={onUndo}>
        <ArrowCounterClockwise weight="bold" aria-hidden="true" />
        <span>Undo</span>
      </button>
      <button type="button" className={styles.secondary} aria-label="Clear drawing" disabled={busy} onClick={onClear}>
        <Trash weight="bold" aria-hidden="true" />
        <span>Clear</span>
      </button>
      <button type="button" className={styles.primary} aria-label="Finish drawing and plan route" disabled={busy || !canFinish} onClick={onDone}>
        <Check weight="bold" aria-hidden="true" />
        <span>{busy ? "Planning…" : "Plan route"}</span>
      </button>
      <button type="button" className={styles.cancel} aria-label="Cancel drawing" onClick={onCancel}>
        <X weight="bold" aria-hidden="true" />
        <span>Cancel</span>
      </button>
    </div>
  )
}
