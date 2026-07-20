"use client"

import { useEffect, useRef } from "react"

export function FocusReturn() {
  const previousRef = useRef<Element | null>(null)

  useEffect(() => {
    previousRef.current = document.activeElement instanceof Element ? document.activeElement : null

    return () => {
      const target = previousRef.current
      if (target instanceof HTMLElement && document.body.contains(target)) {
        try {
          target.focus({ preventScroll: true })
        } catch {
          // noop
        }
      }
    }
  }, [])

  return null
}
