import type {
  NavigationCapabilityFlags,
  NavigationDeviationSample,
  NavigationRecoveryCheckpoint,
  NavigationSessionError,
  NavigationSessionState
} from "./types"

export function createNavigationSessionState(): NavigationSessionState {
  return {
    phase: "idle",
    capabilities: {
      hasGeolocation: false,
      hasWakeLock: false,
      hasVoice: false,
      hasBackground: false
    },
    routeId: null,
    deviationHistory: [],
    recoveryCheckpoints: [],
    reroutePolicy: null,
    recording: { active: false, startedAt: null },
    journalHandoffPending: false,
    lastError: null
  }
}

export function withCapabilities(
  state: NavigationSessionState,
  capabilities: Partial<NavigationCapabilityFlags>
): NavigationSessionState {
  return {
    ...state,
    capabilities: { ...state.capabilities, ...capabilities }
  }
}

export function pushDeviation(
  state: NavigationSessionState,
  sample: NavigationDeviationSample
): NavigationSessionState {
  return {
    ...state,
    deviationHistory: [...state.deviationHistory, sample].slice(-16)
  }
}

export function pushCheckpoint(
  state: NavigationSessionState,
  checkpoint: NavigationRecoveryCheckpoint
): NavigationSessionState {
  return {
    ...state,
    recoveryCheckpoints: [...state.recoveryCheckpoints, checkpoint]
  }
}

export function clearError(state: NavigationSessionState): NavigationSessionState {
  return { ...state, lastError: null }
}

export function setError(
  state: NavigationSessionState,
  error: NavigationSessionError
): NavigationSessionState {
  return { ...state, lastError: error }
}
