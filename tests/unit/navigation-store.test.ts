import { afterEach, describe, expect, it } from "vitest"
import { createNavigationStore } from "@/stores/navigation-store"
import type { NavigationFrame } from "@/lib/client/navigation-engine"

const frame = { routePercent: 12 } as NavigationFrame

describe("navigation frame store", () => {
  it("publishes GPS frame changes without sharing planner state", () => {
    const store = createNavigationStore()
    const snapshots: Array<NavigationFrame | null> = []
    const unsubscribe = store.subscribe(() => snapshots.push(store.getSnapshot()))

    store.setFrame(frame)
    store.clear()
    unsubscribe()

    expect(snapshots).toEqual([frame, null])
    expect(store.getSnapshot()).toBeNull()
  })

  it("does not notify subscribers when the frame identity has not changed", () => {
    const store = createNavigationStore()
    let notifications = 0
    const unsubscribe = store.subscribe(() => { notifications += 1 })

    store.setFrame(frame)
    store.setFrame(frame)
    unsubscribe()

    expect(notifications).toBe(1)
  })

  afterEach(() => {
    // Store instances are intentionally isolated per test.
  })
})
