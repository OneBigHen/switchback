import { describe, expect, it, vi } from "vitest"
import { createRouteSculptClickFence } from "@/components/planner/route-sculpt-click-fence"

describe("route sculpt generated-click fence", () => {
  it("blocks every click handler for the generated click, then clears on the next task", () => {
    let scheduled: (() => void) | null = null
    const schedule = vi.fn((callback: () => void) => {
      scheduled = callback
      return 7
    })
    const cancelSchedule = vi.fn()
    const fence = createRouteSculptClickFence(schedule, cancelSchedule)

    fence.arm()

    // Generic map click and layer-specific alternate-route click both execute
    // during the generated click. Neither is allowed to consume the fence.
    expect(fence.blocked()).toBe(true)
    expect(fence.blocked()).toBe(true)

    scheduled?.()
    expect(fence.blocked()).toBe(false)
  })

  it("cancels a pending fence without suppressing the rider's next click", () => {
    const schedule = vi.fn(() => 9)
    const cancelSchedule = vi.fn()
    const fence = createRouteSculptClickFence(schedule, cancelSchedule)

    fence.arm()
    fence.cancel()

    expect(cancelSchedule).toHaveBeenCalledWith(9)
    expect(fence.blocked()).toBe(false)
  })
})
