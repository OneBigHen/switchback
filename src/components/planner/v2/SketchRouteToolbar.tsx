"use client"

import { ArrowCounterClockwise, Check, Keyboard, Trash, X } from "@phosphor-icons/react"
import { useEffect } from "react"
import styles from "./SketchRouteToolbar.module.css"

export interface SketchRouteToolbarProps {
  canUndo: boolean
  canFinish: boolean
  busy?: boolean
  retry?: boolean
  onUndo(): void
  onClear(): void
  onDone(): void
  onCancel(): void
}

export function SketchRouteToolbar({
  canUndo,
  canFinish,
  busy = false,
  retry = false,
  onUndo,
  onClear,
  onDone,
  onCancel
}: SketchRouteToolbarProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [busy, onCancel])

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
      <button type="button" className={styles.primary} aria-label={retry ? "Retry drawing route" : "Finish drawing and plan route"} disabled={busy || !canFinish} onClick={onDone}>
        <Check weight="bold" aria-hidden="true" />
        <span>{busy ? "Planning…" : retry ? "Retry route" : "Plan route"}</span>
      </button>
      <button type="button" className={styles.cancel} aria-label="Cancel drawing" disabled={busy} onClick={onCancel}>
        <X weight="bold" aria-hidden="true" />
        <span>Cancel</span>
      </button>
      <button type="button" className={styles.fieldsAlternative} aria-label="Use route fields instead" disabled={busy} onClick={onCancel}>
        <Keyboard weight="bold" aria-hidden="true" />
        <span>Use route fields instead</span>
      </button>
    </div>
  )
}
