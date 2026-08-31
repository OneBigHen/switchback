"use client"

import { useEffect, useRef, type ReactNode } from "react"

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",")

export function ModalFocusScope({ children, onEscape }: { children: ReactNode; onEscape(): void }) {
  const scopeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const scope = scopeRef.current
    const controls = () => Array.from(scope?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    controls()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onEscape()
        return
      }
      if (event.key !== "Tab") return
      const items = controls()
      const first = items[0]
      const last = items.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    scope?.addEventListener("keydown", onKeyDown)
    return () => {
      scope?.removeEventListener("keydown", onKeyDown)
      returnTarget?.focus()
    }
  }, [onEscape])

  return <div ref={scopeRef} style={{ display: "contents" }}>{children}</div>
}
