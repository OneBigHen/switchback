"use client"

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  collapseSheetDetent,
  expandSheetDetent,
  type ContextSheetDetent
} from "./context-sheet-state"

/** Minimum vertical drag (CSS px) that counts as an expand/collapse gesture. */
const SHEET_DRAG_THRESHOLD_PX = 64

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
  const dragGestureRef = useRef<"expand" | "collapse" | null>(null)
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
    dragStartRef.current = { pointerId: event.pointerId, clientY: event.clientY }
    dragGestureRef.current = null
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    const deltaY = event.clientY - start.clientY
    if (deltaY <= -SHEET_DRAG_THRESHOLD_PX) dragGestureRef.current = "expand"
    else if (deltaY >= SHEET_DRAG_THRESHOLD_PX) dragGestureRef.current = "collapse"
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current
    dragStartRef.current = null
    if (!start || start.pointerId !== event.pointerId || isPeek) return
    const deltaY = event.clientY - start.clientY
    if (deltaY <= -SHEET_DRAG_THRESHOLD_PX) dragGestureRef.current = "expand"
    else if (deltaY >= SHEET_DRAG_THRESHOLD_PX) dragGestureRef.current = "collapse"
  }

  /**
   * One handle, both directions: a drag resolves the gesture it captured,
   * and a plain tap advances the ladder (half→full, full→half) so keyboard
   * and pointer users always have a path in both directions.
   */
  const handleActivate = () => {
    if (isPeek) return
    const gesture = dragGestureRef.current
    dragGestureRef.current = null
    const target = gesture === "expand"
      ? expandSheetDetent(detent)
      : gesture === "collapse"
        ? collapseSheetDetent(detent)
        : detent === "full"
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
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragStartRef.current = null
            dragGestureRef.current = null
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
