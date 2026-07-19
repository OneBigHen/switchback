import { afterEach, describe, expect, it, vi } from "vitest"
import { browserRequestSignal } from "@/lib/client/request-timeout"

describe("browserRequestSignal", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("delegates to AbortSignal.timeout when the native API is available", () => {
    const sentinel: AbortSignal = new AbortController().signal
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(sentinel)

    const signal = browserRequestSignal(7_500)

    expect(timeoutSpy).toHaveBeenCalledTimes(1)
    expect(timeoutSpy).toHaveBeenCalledWith(7_500)
    expect(signal).toBe(sentinel)
  })

  it("falls back to AbortController + setTimeout when native timeout is unavailable", () => {
    const originalTimeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout")
    Object.defineProperty(AbortSignal, "timeout", {
      value: undefined,
      configurable: true
    })

    try {
      vi.useFakeTimers()

      const signal = browserRequestSignal(2_000)

      expect(signal).toBeDefined()
      expect(signal?.aborted).toBe(false)

      vi.advanceTimersByTime(1_999)
      expect(signal?.aborted).toBe(false)

      vi.advanceTimersByTime(1)
      expect(signal?.aborted).toBe(true)
    } finally {
      if (originalTimeout) {
        Object.defineProperty(AbortSignal, "timeout", originalTimeout)
      }
    }
  })

  it("returns undefined when AbortSignal is missing entirely", () => {
    vi.stubGlobal("AbortSignal", undefined)
    expect(browserRequestSignal(1_000)).toBeUndefined()
  })

  it("returns undefined when AbortController is missing and native timeout is unavailable", () => {
    const originalTimeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout")
    Object.defineProperty(AbortSignal, "timeout", {
      value: undefined,
      configurable: true
    })

    try {
      vi.stubGlobal("AbortController", undefined)
      expect(browserRequestSignal(1_000)).toBeUndefined()
    } finally {
      if (originalTimeout) {
        Object.defineProperty(AbortSignal, "timeout", originalTimeout)
      }
    }
  })
})
