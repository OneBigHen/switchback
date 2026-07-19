"use client"

import { useSyncExternalStore } from "react"
import type { NavigationFrame } from "@/lib/client/navigation-engine"

export interface NavigationStore {
  getSnapshot(): NavigationFrame | null
  subscribe(listener: () => void): () => void
  setFrame(frame: NavigationFrame | null): void
  clear(): void
}

export function createNavigationStore(): NavigationStore {
  let frame: NavigationFrame | null = null
  const listeners = new Set<() => void>()

  function publish() {
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => frame,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setFrame(nextFrame) {
      if (frame === nextFrame) return
      frame = nextFrame
      publish()
    },
    clear() {
      if (frame === null) return
      frame = null
      publish()
    }
  }
}

export const navigationStore = createNavigationStore()

export function useNavigationFrame(): NavigationFrame | null {
  return useSyncExternalStore(
    navigationStore.subscribe,
    navigationStore.getSnapshot,
    navigationStore.getSnapshot
  )
}
