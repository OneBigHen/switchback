import { composeSignals, createDeadline, type DisposableSignal } from "./deadline"

export interface CandidateLane<T> {
  id: string
  priority: number
  pathIndex: number
  budgetMs: number
  run(signal: AbortSignal): Promise<T>
}

export type LaneSettlementStatus = "fulfilled" | "rejected" | "timed-out" | "cancelled"

export interface LaneSettlement<T> {
  lane: CandidateLane<T>
  status: LaneSettlementStatus
  value?: T
  reason?: unknown
  elapsedMs: number
}

export interface SettleLanesOptions<T> {
  concurrency: number
  deadline: DisposableSignal
  shouldStop?: (settled: readonly LaneSettlement<T>[]) => boolean
}

function reasonName(reason: unknown): string | undefined {
  return reason !== null && typeof reason === "object" && "name" in reason
    ? String((reason as { name?: unknown }).name)
    : undefined
}

function laneStatus(
  reason: unknown,
  laneSignal: AbortSignal,
  packetSignal: AbortSignal
): LaneSettlementStatus {
  if (packetSignal.aborted) {
    return reasonName(packetSignal.reason) === "TimeoutError" ? "timed-out" : "cancelled"
  }
  if (laneSignal.aborted) {
    return reasonName(laneSignal.reason) === "TimeoutError" ? "timed-out" : "cancelled"
  }
  if (reasonName(reason) === "TimeoutError") return "timed-out"
  return "rejected"
}

function compareLanes<T>(left: LaneSettlement<T>, right: LaneSettlement<T>): number {
  return left.lane.priority - right.lane.priority ||
    left.lane.pathIndex - right.lane.pathIndex ||
    left.lane.id.localeCompare(right.lane.id)
}

/** Stable final ordering; completion timing is intentionally not an input. */
export function stableLaneOrder<T>(settled: readonly LaneSettlement<T>[]): LaneSettlement<T>[] {
  return [...settled].sort(compareLanes)
}

/** Run a bounded lane pool and resolve as soon as the packet deadline settles. */
export async function settleLanes<T>(
  lanes: readonly CandidateLane<T>[],
  options: SettleLanesOptions<T>
): Promise<LaneSettlement<T>[]> {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new RangeError("Lane concurrency must be a positive integer.")
  }
  for (const lane of lanes) {
    if (!lane.id || !Number.isFinite(lane.priority) || !Number.isInteger(lane.pathIndex) ||
      !Number.isFinite(lane.budgetMs) || lane.budgetMs < 0) {
      throw new RangeError("Each lane needs an id, order, and finite non-negative budget.")
    }
  }

  return new Promise<LaneSettlement<T>[]>((resolve) => {
    const settled: LaneSettlement<T>[] = []
    const active = new Map<string, {
      lane: CandidateLane<T>
      controller: AbortController
      signal: DisposableSignal
      laneDeadline: DisposableSignal
      startedAt: number
    }>()
    let nextIndex = 0
    let finished = false

    const cleanupActive = (reason: unknown) => {
      for (const entry of active.values()) {
        if (!entry.controller.signal.aborted) entry.controller.abort(reason)
        entry.signal.dispose()
        entry.laneDeadline.dispose()
      }
    }

    const finish = () => {
      if (finished) return
      finished = true
      options.deadline.signal.removeEventListener("abort", onPacketAbort)
      cleanupActive(options.deadline.signal.reason)
      resolve(settled)
    }

    const maybeLaunch = () => {
      if (finished || options.deadline.signal.aborted) {
        finish()
        return
      }
      if (options.shouldStop?.(settled) === true) {
        finish()
        return
      }
      while (!finished && !options.deadline.signal.aborted && active.size < options.concurrency && nextIndex < lanes.length) {
        const lane = lanes[nextIndex++]!
        const controller = new AbortController()
        const laneDeadline = createDeadline(lane.budgetMs, options.deadline.signal)
        const signal = composeSignals(controller.signal, laneDeadline.signal)
        const entry = { lane, controller, signal, laneDeadline, startedAt: performance.now() }
        active.set(lane.id, entry)
        void Promise.resolve()
          .then(() => lane.run(signal.signal))
          .then((value) => {
            if (finished) return
            settled.push({ lane, status: "fulfilled", value, elapsedMs: performance.now() - entry.startedAt })
          })
          .catch((reason: unknown) => {
            if (finished) return
            settled.push({
              lane,
              status: laneStatus(reason, signal.signal, options.deadline.signal),
              reason,
              elapsedMs: performance.now() - entry.startedAt
            })
          })
          .finally(() => {
            active.delete(lane.id)
            signal.dispose()
            laneDeadline.dispose()
            if (finished) return
            if (options.shouldStop?.(settled) === true) {
              finish()
              return
            }
            if (nextIndex >= lanes.length && active.size === 0) {
              finish()
              return
            }
            maybeLaunch()
          })
      }
      if (nextIndex >= lanes.length && active.size === 0) finish()
    }

    const onPacketAbort = () => finish()
    options.deadline.signal.addEventListener("abort", onPacketAbort, { once: true })
    maybeLaunch()
  })
}
