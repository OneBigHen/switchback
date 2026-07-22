import type { RecordedRidePoint } from "@/lib/storage/ride-journal"

export type RecordingStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "recording"
  | "paused"
  | "finished"
  | "denied"
  | "error"

export interface RecordingSessionState {
  status: RecordingStatus
  startedAt: number | null
  pausedAt: number | null
  pausedMillis: number
  endedAt: number | null
  points: RecordedRidePoint[]
  error: string | null
}

export type RecordingSessionSnapshot = Pick<
  RecordingSessionState,
  "status" | "startedAt" | "pausedAt" | "pausedMillis" | "endedAt" | "points"
>

export type RecordingSessionAction =
  | { type: "request_permission" }
  | { type: "ready" }
  | { type: "start"; at: number }
  | { type: "sample"; point: RecordedRidePoint }
  | { type: "pause"; at: number }
  | { type: "resume"; at: number }
  | { type: "finish"; at: number }
  | { type: "recover"; snapshot: RecordingSessionSnapshot }
  | { type: "permission_denied"; message: string }
  | { type: "error"; message: string }
  | { type: "reset" }

export function createRecordingState(): RecordingSessionState {
  return {
    status: "idle",
    startedAt: null,
    pausedAt: null,
    pausedMillis: 0,
    endedAt: null,
    points: [],
    error: null
  }
}

export function recordingSessionReducer(
  state: RecordingSessionState,
  action: RecordingSessionAction
): RecordingSessionState {
  switch (action.type) {
    case "request_permission":
      return { ...state, status: "requesting", error: null }
    case "ready":
      return { ...state, status: "ready", error: null }
    case "start":
      return { ...createRecordingState(), status: "recording", startedAt: action.at }
    case "sample":
      return state.status === "recording"
        ? { ...state, points: [...state.points, action.point] }
        : state
    case "pause":
      return state.status === "recording"
        ? { ...state, status: "paused", pausedAt: action.at }
        : state
    case "resume":
      return state.status === "paused"
        ? {
            ...state,
            status: "recording",
            pausedAt: null,
            pausedMillis: state.pausedMillis + Math.max(0, action.at - (state.pausedAt ?? action.at))
          }
        : state
    case "finish":
      return state.status === "recording" || state.status === "paused"
        ? {
            ...state,
            status: "finished",
            endedAt: action.at,
            pausedMillis: state.pausedMillis + (state.status === "paused"
              ? Math.max(0, action.at - (state.pausedAt ?? action.at))
              : 0),
            pausedAt: null
          }
        : state
    case "recover": {
      const interrupted = action.snapshot.status === "recording"
      return {
        ...createRecordingState(),
        ...action.snapshot,
        status: interrupted ? "paused" : action.snapshot.status,
        pausedAt: interrupted ? Date.now() : action.snapshot.pausedAt,
        error: null
      }
    }
    case "permission_denied":
      return { ...state, status: "denied", error: action.message }
    case "error":
      return { ...state, status: "error", error: action.message }
    case "reset":
      return createRecordingState()
  }
}

export function activeRecordingMillis(state: RecordingSessionState, now: number): number {
  if (state.startedAt == null) return 0
  const end = state.endedAt ?? (state.pausedAt ?? now)
  return Math.max(0, end - state.startedAt - state.pausedMillis)
}
