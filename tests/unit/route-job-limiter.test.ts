import { describe, expect, it } from "vitest"
import { createRouteJobLimiter } from "@/lib/server/route-job-limiter"

function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe("route job limiter", () => {
  it("runs one primary job with both tokens while a second waits", async () => {
    const limiter = createRouteJobLimiter(2)
    const first = deferred()
    const second = deferred()
    const firstDone = limiter.run(() => first.promise, { priority: "primary" })
    const secondDone = limiter.run(() => second.promise, { priority: "primary" })

    // First primary holds both tokens; the second is queued.
    await Promise.resolve()
    expect(limiter.runningCount()).toBe(2)
    expect(limiter.queuedCount()).toBe(1)

    first.resolve("first")
    await expect(firstDone).resolves.toBe("first")
    second.resolve("second")
    await expect(secondDone).resolves.toBe("second")
    expect(limiter.queuedCount()).toBe(0)
  })

  it("lets a primary request acquire both tokens while an alternative holds one", async () => {
    const limiter = createRouteJobLimiter(2)
    const alternative = deferred()
    const primary = deferred()

    const alternativeDone = limiter.run(() => alternative.promise, { priority: "alternatives" })
    await Promise.resolve()
    expect(limiter.runningCount()).toBe(1)

    // A primary needs both tokens; it must wait for the alternative to finish.
    const primaryDone = limiter.run(() => primary.promise, { priority: "primary" })
    await Promise.resolve()
    expect(limiter.queuedCount()).toBe(1)

    alternative.resolve("alt")
    await expect(alternativeDone).resolves.toBe("alt")
    primary.resolve("primary")
    await expect(primaryDone).resolves.toBe("primary")
  })

  it("dequeues a queued primary ahead of queued alternatives", async () => {
    const limiter = createRouteJobLimiter(2)
    const firstPrimary = deferred()
    const secondPrimary = deferred()
    const alternative = deferred()

    const firstDone = limiter.run(() => firstPrimary.promise, { priority: "primary" })
    await Promise.resolve()
    const alternativeDone = limiter.run(() => alternative.promise, { priority: "alternatives" })
    const secondDone = limiter.run(() => secondPrimary.promise, { priority: "primary" })

    // Alternative queued first, then a primary: the primary jumps the queue
    // (second primary runs when the first releases a token).
    firstPrimary.resolve("first")
    await expect(firstDone).resolves.toBe("first")
    secondPrimary.resolve("second")
    await expect(secondDone).resolves.toBe("second")
    alternative.resolve("alt")
    await expect(alternativeDone).resolves.toBe("alt")
  })

  it("rejects a queued job when its lifecycle signal aborts", async () => {
    const limiter = createRouteJobLimiter(2)
    const blocker = deferred()
    const controller = new AbortController()

    const holding = limiter.run(() => blocker.promise, { priority: "primary" })
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
    await expect(queued).resolves.toBe("queued")
    await expect(queued2).resolves.toBe("queued2")
    expect(limiter.queuedCount()).toBe(0)
  })
})
