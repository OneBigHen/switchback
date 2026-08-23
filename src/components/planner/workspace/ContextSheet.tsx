"use client"

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  collapseSheetDetent,
  expandSheetDetent,
  type ContextSheetDetent
} from "./context-sheet-state"

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
  const isPeek = detent === "peek"
  const isHidden = detent === "closed" || detent === "immersive"
  const usesPeekContent = isPeek && peekContent !== undefined
  const nextDetent = isPeek ? expandSheetDetent(detent) : collapseSheetDetent(detent)
  const classes = [
    "sb-context-sheet",
    className,
    isPeek ? "is-minimized" : null,
    detent === "closed" ? "is-closed" : null
  ].filter((value): value is string => Boolean(value)).join(" ")

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragStartRef.current = { pointerId: event.pointerId, clientY: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = dragStartRef.current
    dragStartRef.current = null
    if (!start || start.pointerId !== event.pointerId || isPeek) return
    if (event.clientY - start.clientY >= 64 && nextDetent) onDetentChange(nextDetent)
  }

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
              if (nextDetent) onDetentChange(nextDetent)
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
          aria-label="Collapse planner sheet by dragging down or tapping"
          aria-controls={id}
          aria-expanded={true}
          onClick={() => {
            if (nextDetent) onDetentChange(nextDetent)
          }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { dragStartRef.current = null }}
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
