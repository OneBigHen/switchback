/**
 * Bounded, priority-aware scheduling for provider work on the host.
 *
 * The host is a small machine, so provider calls are shaped by a token
 * semaphore: a primary lifecycle may hold both tokens (letting one primary
 * corridor evaluate two candidates concurrently), while alternatives hold
 * at most one token and always dequeue behind queued primary work. Queue
 * entries are abortable, so a cancelled lifecycle never leaves dead work
 * waiting for a token. Health checks bypass the queue entirely.
 */
export type JobPriority = "primary" | "alternatives"

export interface RouteJobLimiter {
  run<T>(
    task: () => Promise<T>,
    options: { priority: JobPriority; signal?: AbortSignal }
  ): Promise<T>
  /** Number of tokens currently held by running jobs (observability). */
  runningCount(): number
  /** Number of jobs waiting for a token (observability). */
  queuedCount(): number
}

interface QueuedJob {
  priority: JobPriority
  tokens: number
  task: () => Promise<unknown>
  signal?: AbortSignal
  onAbort?: () => void
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

function abortError(): Error {
  const error = new Error("The request was aborted while waiting for a routing slot.")
  error.name = "AbortError"
  return error
}

export function createRouteJobLimiter(limit = 2): RouteJobLimiter {
  const tokens = limit
  let running = 0
  const primaryQueue: QueuedJob[] = []
  const alternativesQueue: QueuedJob[] = []

  function removeFromQueue(queue: QueuedJob[], job: QueuedJob): void {
    const index = queue.indexOf(job)
    if (index >= 0) queue.splice(index, 1)
  }

  function start(job: QueuedJob): void {
    running += job.tokens
    // Remove the queued-abort listener; a running job's own fetch observes
    // the lifecycle signal and rejects itself.
    job.onAbort?.()
    void Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        running -= job.tokens
        drain()
      })
  }

  function drain(): void {
    while (running < tokens) {
      const nextPrimary = primaryQueue[0]
      if (nextPrimary && running + nextPrimary.tokens <= tokens) {
        primaryQueue.shift()
        start(nextPrimary)
        continue
      }
      const nextAlternative = alternativesQueue[0]
      if (nextAlternative && running + nextAlternative.tokens <= tokens) {
        alternativesQueue.shift()
        start(nextAlternative)
        continue
      }
      return
    }
  }

  function enqueue(job: QueuedJob, queue: QueuedJob[]): void {
    queue.push(job)
    if (!job.signal) {
      drain()
      return
    }
    const onAbort = () => {
      removeFromQueue(queue, job)
      job.reject(abortError())
    }
    if (job.signal.aborted) {
      removeFromQueue(queue, job)
      job.reject(abortError())
      return
    }
    job.signal.addEventListener("abort", onAbort, { once: true })
    // After the job starts, this only detaches the listener above.
    job.onAbort = () => job.signal?.removeEventListener("abort", onAbort)
    drain()
  }

  return {
    runningCount: () => running,
    queuedCount: () => primaryQueue.length + alternativesQueue.length,
    run<T>(task: () => Promise<T>, { priority, signal }: { priority: JobPriority; signal?: AbortSignal }) {
      return new Promise<T>((resolve, reject) => {
        const job: QueuedJob = {
          priority,
          tokens: priority === "primary" ? tokens : 1,
          task: task as () => Promise<unknown>,
          signal,
          resolve: (value) => resolve(value as T),
          reject
        }
        enqueue(job, priority === "primary" ? primaryQueue : alternativesQueue)
      })
    }
  }
}
