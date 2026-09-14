import { describe, expect, it } from "vitest"
import { createRouteJobLimiter } from "@/lib/server/route-job-limiter"

function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe("route job limiter", () => {
  it("runs two primary jobs side by side and queues a third", async () => {
    const limiter = createRouteJobLimiter(2)
    const first = deferred()
    const second = deferred()
    const third = deferred()
    const firstDone = limiter.run(() => first.promise, { priority: "primary" })
    const secondDone = limiter.run(() => second.promise, { priority: "primary" })
    const thirdDone = limiter.run(() => third.promise, { priority: "primary" })

    // One token per call: a lifecycle's paired corridor or loop-retry calls
    // really do overlap, instead of the first primary starving the second.
    await Promise.resolve()
    expect(limiter.runningCount()).toBe(2)
    expect(limiter.queuedCount()).toBe(1)

    first.resolve("first")
    await expect(firstDone).resolves.toBe("first")
    second.resolve("second")
    third.resolve("third")
    await expect(secondDone).resolves.toBe("second")
    await expect(thirdDone).resolves.toBe("third")
    expect(limiter.queuedCount()).toBe(0)
  })

  it("starts a primary alongside a running alternative", async () => {
    const limiter = createRouteJobLimiter(2)
    const alternative = deferred()
    const primary = deferred()

    const alternativeDone = limiter.run(() => alternative.promise, { priority: "alternatives" })
    await Promise.resolve()
    expect(limiter.runningCount()).toBe(1)

    const primaryDone = limiter.run(() => primary.promise, { priority: "primary" })
    await Promise.resolve()
    expect(limiter.runningCount()).toBe(2)
    expect(limiter.queuedCount()).toBe(0)

    alternative.resolve("alt")
    await expect(alternativeDone).resolves.toBe("alt")
    primary.resolve("primary")
    await expect(primaryDone).resolves.toBe("primary")
  })

  it("dequeues a queued primary ahead of queued alternatives", async () => {
    const limiter = createRouteJobLimiter(2)
    const holders = [deferred(), deferred()]
    const started: string[] = []
    const holding = holders.map((holder) => limiter.run(() => holder.promise, { priority: "primary" }))
    await Promise.resolve()

    // The alternative queues first, then a primary: when a token frees, the
    // primary jumps the queue.
    const alternativeDone = limiter.run(async () => { started.push("alternative") }, { priority: "alternatives" })
    const primaryDone = limiter.run(async () => { started.push("primary") }, { priority: "primary" })
    await Promise.resolve()
    expect(limiter.queuedCount()).toBe(2)

    holders[0]!.resolve("released")
    await holding[0]
    await primaryDone
    expect(started[0]).toBe("primary")

    holders[1]!.resolve("released")
    await holding[1]
    await alternativeDone
    expect(started).toEqual(["primary", "alternative"])
  })

  it("rejects a queued job when its lifecycle signal aborts", async () => {
    const limiter = createRouteJobLimiter(2)
    const blocker = deferred()
    const controller = new AbortController()

    const holding = limiter.run(() => blocker.promise, { priority: "primary" })
    const holdingToo = limiter.run(() => blocker.promise, { priority: "primary" })
    await Promise.resolve()
    expect(limiter.runningCount()).toBe(2)

    const queued = limiter.run(
      () => Promise.resolve("never"),
      { priority: "alternatives", signal: controller.signal }
    )
    await Promise.resolve()
    expect(limiter.queuedCount()).toBe(1)

    controller.abort()
    await expect(queued).rejects.toMatchObject({ name: "AbortError" })
    expect(limiter.queuedCount()).toBe(0)

    blocker.resolve("done")
    await expect(holding).resolves.toBe("done")
    await expect(holdingToo).resolves.toBe("done")
  })

  it("rejects immediately when enqueued with an already-aborted signal", async () => {
    const limiter = createRouteJobLimiter(2)
    const controller = new AbortController()
    controller.abort()

    await expect(limiter.run(
      () => Promise.resolve("never"),
      { priority: "alternatives", signal: controller.signal }
    )).rejects.toMatchObject({ name: "AbortError" })
  })

  it("rejects with RouteQueueFullError when the queue is at capacity", async () => {
    const limiter = createRouteJobLimiter(2, { maxQueue: 2 })
    const blocker = deferred()
    const holding = limiter.run(() => blocker.promise, { priority: "primary" })
    const holdingToo = limiter.run(() => blocker.promise, { priority: "primary" })
    await Promise.resolve()
    expect(limiter.runningCount()).toBe(2)

    const queued = limiter.run(() => Promise.resolve("queued"), { priority: "alternatives" })
    const queued2 = limiter.run(() => Promise.resolve("queued2"), { priority: "alternatives" })
    await Promise.resolve()
    expect(limiter.queuedCount()).toBe(2)

    await expect(limiter.run(
      () => Promise.resolve("overflow"),
      { priority: "alternatives" }
    )).rejects.toMatchObject({ name: "RouteQueueFullError" })

    blocker.resolve("done")
    await expect(holding).resolves.toBe("done")
    await expect(holdingToo).resolves.toBe("done")
    await expect(queued).resolves.toBe("queued")
    await expect(queued2).resolves.toBe("queued2")
    expect(limiter.queuedCount()).toBe(0)
  })
})
