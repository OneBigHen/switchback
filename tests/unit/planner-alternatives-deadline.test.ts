import { afterEach, describe, expect, it, vi } from "vitest"
import { composeSignals, createDeadline, timeoutSignal } from "@/lib/routing/deadline"

describe("routing deadline signals", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("aborts a timeout signal at its budget and cleans its timer", () => {
    vi.useFakeTimers()

    const resource = timeoutSignal(1_000)

    expect(resource.signal.aborted).toBe(false)
    vi.advanceTimersByTime(999)
    expect(resource.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)

    expect(resource.signal.aborted).toBe(true)
    expect(resource.signal.reason).toMatchObject({ name: "TimeoutError" })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("preserves caller cancellation and disposes the deadline timer", () => {
    vi.useFakeTimers()

    const caller = new AbortController()
    const reason = new Error("rider cancelled")
    const deadline = createDeadline(5_000, caller.signal)

    caller.abort(reason)

    expect(deadline.signal.aborted).toBe(true)
    expect(deadline.signal.reason).toBe(reason)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cleans composed listeners and timers after explicit disposal", () => {
    vi.useFakeTimers()

    const parent = new AbortController()
    const timeout = timeoutSignal(5_000)
    const composed = composeSignals(parent.signal, timeout.signal)

    composed.dispose()
    timeout.dispose()
    parent.abort(new Error("late cancellation"))

    expect(composed.signal.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    composed.dispose()
  })

  it("mirrors an already-aborted parent without creating a live timer", () => {
    vi.useFakeTimers()

    const parent = new AbortController()
    const reason = new Error("already cancelled")
    parent.abort(reason)
    const deadline = createDeadline(5_000, parent.signal)

    expect(deadline.signal.aborted).toBe(true)
    expect(deadline.signal.reason).toBe(reason)
    expect(vi.getTimerCount()).toBe(0)
  })
})
