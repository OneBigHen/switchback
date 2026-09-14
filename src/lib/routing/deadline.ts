export interface DisposableSignal {
  signal: AbortSignal
  dispose(): void
}

const TIMEOUT_MESSAGE = "The routing deadline expired."

function timeoutReason(): DOMException {
  return new DOMException(TIMEOUT_MESSAGE, "TimeoutError")
}

function validateDuration(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError("A routing signal duration must be a finite non-negative number.")
  }
}

/** Create a manually controlled timeout signal so fake timers can drive it. */
export function timeoutSignal(ms: number): DisposableSignal {
  validateDuration(ms)
  const controller = new AbortController()
  let disposed = false

  const timer = setTimeout(() => {
    controller.abort(timeoutReason())
  }, ms)

  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimeout(timer)
    controller.signal.removeEventListener("abort", dispose)
  }

  controller.signal.addEventListener("abort", dispose, { once: true })
  return { signal: controller.signal, dispose }
}

/** Compose parent signals while retaining explicit listener ownership. */
export function composeSignals(...signals: Array<AbortSignal | undefined>): DisposableSignal {
  const controller = new AbortController()
  const defined = signals.filter((signal): signal is AbortSignal => signal !== undefined)
  let disposed = false

  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const signal of defined) signal.removeEventListener("abort", onAbort)
  }

  const onAbort = (event: Event) => {
    const source = event.target as AbortSignal
    controller.abort(source.reason)
    dispose()
  }

  for (const signal of defined) signal.addEventListener("abort", onAbort, { once: true })
  const alreadyAborted = defined.find((signal) => signal.aborted)
  if (alreadyAborted) {
    controller.abort(alreadyAborted.reason)
    dispose()
  }

  return { signal: controller.signal, dispose }
}

/** Own one alternatives deadline and all of the listeners/timers it composes. */
export function createDeadline(ms: number, parent?: AbortSignal): DisposableSignal {
  const timeout = timeoutSignal(ms)
  const composed = composeSignals(parent, timeout.signal)
  const onComposedAbort = () => timeout.dispose()
  composed.signal.addEventListener("abort", onComposedAbort, { once: true })
  if (composed.signal.aborted) timeout.dispose()
  return {
    signal: composed.signal,
    dispose: () => {
      composed.signal.removeEventListener("abort", onComposedAbort)
      composed.dispose()
      timeout.dispose()
    }
  }
}
