import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type {
  NavigationRecoveryCheckpoint,
  NavigationReroutePolicy,
  NavigationSessionState,
  NavigationSessionViewModel
} from "./types"

let lastState: NavigationSessionState | null = null
let lastFrame: NavigationFrame | null = null
let lastResult: NavigationSessionViewModel | null = null

export function selectViewModel(
  state: NavigationSessionState,
  frame: NavigationFrame | null
): NavigationSessionViewModel {
  if (lastState === state && lastFrame === frame && lastResult) return lastResult

  const result: NavigationSessionViewModel = {
    phase: state.phase,
    routeId: state.routeId,
    capabilities: state.capabilities,
    isCapabilityDegraded: isCapabilityDegraded(state),
    canPause: canPause(state),
    canResume: canResume(state),
    canCancelReroute: canCancelReroute(state),
    canRecover: canRecover(state),
    canBeginRecording: canBeginRecording(state),
    canFinishRecording: canFinishRecording(state),
    recordingActive: state.recording.active,
    recordingStartedAt: state.recording.startedAt,
    reroutePolicy: state.reroutePolicy,
    journalHandoffPending: state.journalHandoffPending,
    lastError: state.lastError,
    deviationCount: state.deviationHistory.length,
    lastDeviation: state.deviationHistory.at(-1) ?? null,
    checkpointCount: state.recoveryCheckpoints.length,
    latestCheckpoint: state.recoveryCheckpoints.at(-1) ?? null,
    frame
  }

  lastState = state
  lastFrame = frame
  lastResult = result

  return result
}

export function selectReroutePolicy(state: NavigationSessionState): NavigationReroutePolicy | null {
  return state.reroutePolicy
}

export function selectRecoveryCheckpoints(
  state: NavigationSessionState
): readonly NavigationRecoveryCheckpoint[] {
  return state.recoveryCheckpoints
}

export function isCapabilityDegraded(state: NavigationSessionState): boolean {
  return !state.capabilities.hasGeolocation
    || !state.capabilities.hasWakeLock
    || !state.capabilities.hasVoice
    || !state.capabilities.hasBackground
}

export function canPause(state: NavigationSessionState): boolean {
  return state.phase === "navigating"
}

export function canResume(state: NavigationSessionState): boolean {
  return state.phase === "paused" || state.phase === "recovering"
}

export function canCancelReroute(state: NavigationSessionState): boolean {
  return state.phase === "rerouting"
}

export function canRecover(state: NavigationSessionState): boolean {
  return ["navigating", "paused", "recovering", "rerouting"].includes(state.phase)
}

export function canBeginRecording(state: NavigationSessionState): boolean {
  return state.phase === "navigating" && !state.recording.active
}

export function canFinishRecording(state: NavigationSessionState): boolean {
  return state.recording.active
}
