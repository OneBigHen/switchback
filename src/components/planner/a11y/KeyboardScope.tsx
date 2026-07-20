"use client"

import { type ReactNode, useEffect, useRef } from "react"

export interface KeyboardScopeProps {
  children: ReactNode
  onEscape: () => void
  stopPropagation?: boolean
}

export function KeyboardScope({ children, onEscape, stopPropagation = false }: KeyboardScopeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const container = node

    function handler(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (!container.contains(event.target as Node)) return

      onEscape()
      if (stopPropagation) event.stopPropagation()
    }

    container.addEventListener("keydown", handler, { capture: false })
    return () => container.removeEventListener("keydown", handler)
  }, [onEscape, stopPropagation])

  return <div ref={containerRef}>{children}</div>
}
