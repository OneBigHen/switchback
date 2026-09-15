export const WORKFLOW_NAMES = [
  "planner_to_first_routes",
  "route_comparison",
  "planner_to_navigation",
  "free_ride_discovery",
  "free_ride_live",
  "gpx_import",
  "gpx_library_to_route",
  "share_flow",
  "offline_pack_download",
  "reroute_recovery"
] as const

export type WorkflowName = typeof WORKFLOW_NAMES[number]
export type WorkflowSpanOutcome = "success" | "cancelled" | "failure" | "abandoned"

export interface WorkflowSpanProperties {
  span_id: string
  workflow: WorkflowName
  session_id: string
  started_at: string
  ended_at: string
  duration_ms: number
  foreground_duration_ms: number
  outcome: WorkflowSpanOutcome
  step_count: number
  [key: string]: string | number | boolean
}

export interface WorkflowSpanHandle {
  readonly spanId: string
  end(outcome?: WorkflowSpanOutcome, properties?: Record<string, string | number | boolean>): boolean
  cancel(properties?: Record<string, string | number | boolean>): boolean
  fail(failureClass?: string, properties?: Record<string, string | number | boolean>): boolean
  abandon(properties?: Record<string, string | number | boolean>): boolean
  step(): void
}

interface TrackerOptions {
  now?: () => number
  visibility?: () => "visible" | "hidden"
  onComplete(span: WorkflowSpanProperties): void
  createId?: () => string
  sessionId?: string
}

interface ActiveSpan {
  workflow: WorkflowName
  spanId: string
  startedAt: number
  visibleSince: number | null
  foregroundDuration: number
  stepCount: number
  context: Record<string, string | number | boolean>
  completed: boolean
}

function defaultVisibility(): "visible" | "hidden" {
  return typeof document === "undefined" || document.visibilityState === "visible" ? "visible" : "hidden"
}

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  return `span-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function defaultSessionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID()
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createWorkflowSpanTracker(options: TrackerOptions) {
  const now = options.now ?? Date.now
  const visibility = options.visibility ?? defaultVisibility
  const createId = options.createId ?? defaultId
  const sessionId = options.sessionId ?? defaultSessionId()
  const active = new Map<string, ActiveSpan>()

  const closeVisibleWindow = (span: ActiveSpan, timestamp: number) => {
    if (span.visibleSince === null) return
    span.foregroundDuration += Math.max(0, timestamp - span.visibleSince)
    span.visibleSince = null
  }

  const visibilityChanged = () => {
    const timestamp = now()
    const nextVisibility = visibility()
    for (const span of active.values()) {
      if (nextVisibility === "visible") {
        if (span.visibleSince === null) span.visibleSince = timestamp
      } else {
        closeVisibleWindow(span, timestamp)
      }
    }
  }

  const start = (
    workflow: WorkflowName,
    context: Record<string, string | number | boolean> = {}
  ): WorkflowSpanHandle => {
    const span: ActiveSpan = {
      workflow,
      spanId: createId(),
      startedAt: now(),
      visibleSince: visibility() === "visible" ? now() : null,
      foregroundDuration: 0,
      stepCount: 0,
      context: { ...context, session_id: sessionId },
      completed: false
    }
    active.set(span.spanId, span)

    const end = (
      outcome: WorkflowSpanOutcome = "success",
      properties: Record<string, string | number | boolean> = {}
    ): boolean => {
      if (span.completed) return false
      const timestamp = now()
      if (span.visibleSince !== null) closeVisibleWindow(span, timestamp)
      span.completed = true
      active.delete(span.spanId)
      options.onComplete({
        ...span.context,
        ...properties,
        session_id: sessionId,
        span_id: span.spanId,
        workflow: span.workflow,
        started_at: new Date(span.startedAt).toISOString(),
        ended_at: new Date(timestamp).toISOString(),
        duration_ms: Math.max(0, timestamp - span.startedAt),
        foreground_duration_ms: Math.max(0, span.foregroundDuration),
        outcome,
        step_count: span.stepCount
      })
      return true
    }

    return {
      spanId: span.spanId,
      end,
      cancel: (properties) => end("cancelled", properties),
      fail: (failureClass, properties) => end("failure", {
        ...(failureClass ? { failure_class: failureClass } : {}),
        ...properties
      }),
      abandon: (properties) => end("abandoned", properties),
      step: () => {
        if (!span.completed) span.stepCount += 1
      }
    }
  }

  return { start, visibilityChanged }
}
