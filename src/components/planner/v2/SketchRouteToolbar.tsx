"use client"

import { ArrowCounterClockwise, Check, Trash, X } from "@phosphor-icons/react"
import styles from "./SketchRouteToolbar.module.css"

export interface SketchRouteToolbarProps {
  canUndo: boolean
  canFinish: boolean
  onUndo(): void
  onClear(): void
  onDone(): void
  onCancel(): void
}

export function SketchRouteToolbar({
  canUndo,
  canFinish,
  onUndo,
  onClear,
  onDone,
  onCancel
}: SketchRouteToolbarProps) {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Draw route controls">
      <button type="button" className={styles.secondary} aria-label="Undo drawing point" disabled={!canUndo} onClick={onUndo}>
        <ArrowCounterClockwise weight="bold" aria-hidden="true" />
        <span>Undo</span>
      </button>
      <button type="button" className={styles.secondary} aria-label="Clear drawing" onClick={onClear}>
        <Trash weight="bold" aria-hidden="true" />
        <span>Clear</span>
      </button>
      <button type="button" className={styles.primary} aria-label="Finish drawing" disabled={!canFinish} onClick={onDone}>
        <Check weight="bold" aria-hidden="true" />
        <span>Done</span>
      </button>
      <button type="button" className={styles.cancel} aria-label="Cancel drawing" onClick={onCancel}>
        <X weight="bold" aria-hidden="true" />
        <span>Cancel</span>
      </button>
    </div>
  )
}
