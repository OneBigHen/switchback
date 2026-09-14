import { afterEach, describe, expect, it, vi } from "vitest"
import { composeSignals, createDeadline, timeoutSignal } from "@/lib/routing/deadline"
import { chooseAlternativesStrategy } from "@/lib/routing/alternatives-strategy"
import {
  settleLanes,
  stableLaneOrder,
  type CandidateLane
} from "@/lib/routing/candidate-lanes"

function directRequest(miles: number, extra: Record<string, unknown> = {}) {
  return {
    profile: "twisty" as const,
    points: [
      { lat: 0, lon: 0 },
      { lat: 0, lon: miles / 69.09332414, label: "finish" }
    ],
    ...extra
  }
}

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

describe("alternatives strategy", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("uses engine alternates for short direct requests at or below the boundary", () => {
    expect(chooseAlternativesStrategy(directRequest(59.9))).toBe("engine-alternates")
    expect(chooseAlternativesStrategy(directRequest(60))).toBe("engine-alternates")
  })

  it("uses lane search for long, corridor, and multi-point requests", () => {
    expect(chooseAlternativesStrategy(directRequest(60.1))).toBe("lane-search")
    expect(chooseAlternativesStrategy(directRequest(20, { sketchCorridor: [[0, 0], [0.1, 0.1]] }))).toBe("lane-search")
    expect(chooseAlternativesStrategy({
      ...directRequest(20),
      points: [{ lat: 0, lon: 0 }, { lat: 0, lon: 0.1 }, { lat: 0, lon: 0.2 }]
    })).toBe("lane-search")
  })

  it("accepts a positive environment threshold override and ignores malformed values", () => {
    vi.stubEnv("ROUTING_ENGINE_ALTERNATES_MAX_MILES", "10")
    expect(chooseAlternativesStrategy(directRequest(10.1))).toBe("lane-search")

    vi.stubEnv("ROUTING_ENGINE_ALTERNATES_MAX_MILES", "not-a-number")
    expect(chooseAlternativesStrategy(directRequest(20))).toBe("engine-alternates")
  })
})

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    signal.addEventListener("abort", () => reject(signal.reason), { once: true })
  })
}

describe("candidate lane settlement", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps a finished later lane when an earlier lane hangs at the deadline", async () => {
    vi.useFakeTimers()
    const deadline = createDeadline(1_000)
    const lanes: CandidateLane<string>[] = [
      { id: "slow", priority: 0, pathIndex: 0, budgetMs: 1_200, run: (signal) => waitForAbort(signal) },
      { id: "fast", priority: 1, pathIndex: 0, budgetMs: 1_200, run: async () => "fast" }
    ]

    const settledPromise = settleLanes(lanes, { concurrency: 2, deadline })
    await vi.advanceTimersByTimeAsync(1_000)
    const settled = await settledPromise

    expect(settled.map((result) => result.lane.id)).toEqual(["fast"])
    expect(settled[0]?.status).toBe("fulfilled")
  })

  it("produces stable lane order independent of completion order", () => {
    const lanes: CandidateLane<string>[] = [
      { id: "primary", priority: 1, pathIndex: 0, budgetMs: 100, run: async () => "primary" },
      { id: "quick", priority: 0, pathIndex: 0, budgetMs: 100, run: async () => "quick" },
      { id: "primary-2", priority: 1, pathIndex: 1, budgetMs: 100, run: async () => "primary-2" }
    ]
    const results = lanes.map((lane) => ({ lane, status: "fulfilled" as const, value: lane.id }))

    expect(stableLaneOrder([...results].reverse()).map((result) => result.lane.id))
      .toEqual(["quick", "primary", "primary-2"])
  })

  it("aborts an over-budget lane and starts the next lane", async () => {
    vi.useFakeTimers()
    const deadline = createDeadline(1_000)
    const started: string[] = []
    const lanes: CandidateLane<string>[] = [
      {
        id: "over-budget",
        priority: 0,
        pathIndex: 0,
        budgetMs: 10,
        run: async (signal) => {
          started.push("over-budget")
          await waitForAbort(signal)
          return "never"
        }
      },
      {
        id: "next",
        priority: 1,
        pathIndex: 0,
        budgetMs: 100,
        run: async () => {
          started.push("next")
          return "next"
        }
      }
    ]

    const settledPromise = settleLanes(lanes, { concurrency: 1, deadline })
    await vi.advanceTimersByTimeAsync(10)
    const settled = await settledPromise

    expect(started).toEqual(["over-budget", "next"])
    expect(settled.map((result) => [result.lane.id, result.status])).toEqual([
      ["over-budget", "timed-out"],
      ["next", "fulfilled"]
    ])
  })

  it("stops launching queued lanes when the caller cancels", async () => {
    vi.useFakeTimers()
    const caller = new AbortController()
    const deadline = createDeadline(1_000, caller.signal)
    const started: string[] = []
    const lanes: CandidateLane<string>[] = [
      { id: "active", priority: 0, pathIndex: 0, budgetMs: 500, run: async (signal) => {
        started.push("active")
        await waitForAbort(signal)
        return "never"
      } },
      { id: "queued", priority: 1, pathIndex: 0, budgetMs: 500, run: async () => {
        started.push("queued")
        return "queued"
      } }
    ]

    const settledPromise = settleLanes(lanes, { concurrency: 1, deadline })
    caller.abort(new Error("rider cancelled"))
    await vi.runAllTimersAsync()
    const settled = await settledPromise

    expect(started).toEqual(["active"])
    expect(settled).toEqual([])
  })
})
