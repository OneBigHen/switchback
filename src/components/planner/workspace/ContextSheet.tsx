"use client"

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  collapseSheetDetent,
  expandSheetDetent,
  type ContextSheetDetent
} from "./context-sheet-state"

/** Minimum vertical drag (CSS px) that counts as an expand/collapse gesture. */
const SHEET_DRAG_THRESHOLD_PX = 24

export interface ContextSheetProps {
  id: string
  label: string
  detent: ContextSheetDetent
  onDetentChange(next: ContextSheetDetent): void
  children: ReactNode
  peekContent?: ReactNode
  footer?: ReactNode
  overlays?: ReactNode
  className?: string
}

export function ContextSheet({
  id,
  label,
  detent,
  onDetentChange,
  children,
  peekContent,
  footer,
  overlays,
  className
}: ContextSheetProps) {
  const dragStartRef = useRef<{ pointerId: number; clientY: number } | null>(null)
  const suppressNextClickRef = useRef(false)
  const isPeek = detent === "peek"
  const isHidden = detent === "closed" || detent === "immersive"
  const usesPeekContent = isPeek && peekContent !== undefined
  const classes = [
    "sb-context-sheet",
    className,
    isPeek ? "is-minimized" : null,
    detent === "closed" ? "is-closed" : null
  ].filter((value): value is string => Boolean(value)).join(" ")

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    suppressNextClickRef.current = false
    dragStartRef.current = { pointerId: event.pointerId, clientY: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current
    dragStartRef.current = null
    if (!start || start.pointerId !== event.pointerId || isPeek) return
    const deltaY = event.clientY - start.clientY
    const target = deltaY <= -SHEET_DRAG_THRESHOLD_PX
      ? expandSheetDetent(detent)
      : deltaY >= SHEET_DRAG_THRESHOLD_PX
        ? collapseSheetDetent(detent)
        : null
    if (target) {
      suppressNextClickRef.current = true
      onDetentChange(target)
    }
  }

  /**
   * A plain tap advances the ladder (half→full, full→half), so touch and
   * keyboard users retain the same progressive-disclosure path as a drag.
   */
  const handleActivate = () => {
    if (isPeek) return
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    const target = detent === "full"
      ? collapseSheetDetent(detent)
      : expandSheetDetent(detent)
    if (target) onDetentChange(target)
  }

  const handleLabel = detent === "full"
    ? "Collapse planner sheet"
    : "Expand planner sheet"

  return (
    <aside
      id={id}
      className={classes}
      data-sheet-detent={detent}
      data-sheet-state={isPeek || isHidden ? "collapsed" : "expanded"}
      aria-label={label}
    >
      {!isHidden && isPeek && usesPeekContent ? (
        <div className="planner-mini-header">
          <button
            type="button"
            className="planner-expand"
            aria-label="Expand planner sheet"
            aria-controls={id}
            aria-expanded={false}
            onClick={() => {
              const target = expandSheetDetent(detent)
              if (target) onDetentChange(target)
            }}
          >
            {peekContent}
          </button>
        </div>
      ) : null}
      {!isHidden && !isPeek ? (
        <button
          type="button"
          className="planner-sheet-handle"
          aria-label={handleLabel}
          aria-controls={id}
          aria-expanded={detent !== "full"}
          onClick={handleActivate}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragStartRef.current = null
            suppressNextClickRef.current = false
          }}
        >
          <span aria-hidden="true" />
        </button>
      ) : null}
      {!isHidden && !usesPeekContent ? children : null}
      {!isHidden ? footer : null}
      {overlays}
    </aside>
  )
}
