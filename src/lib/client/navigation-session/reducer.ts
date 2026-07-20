import type {
  NavigationSessionCommand,
  NavigationSessionEffect,
  NavigationSessionState,
  NavigationSessionTransition
} from "./types"
import {
  clearError,
  createNavigationSessionState,
  pushCheckpoint,
  pushDeviation,
  setError,
  withCapabilities
} from "./state"

export const DEVIATION_OFF_ROUTE_METERS = 35
export const REROUTE_TIMEOUT_MILLIS = 30_000
export const STALE_FIX_TIMEOUT_MILLIS = 60_000
export const REROUTE_TIMEOUT_TAG = "reroute-timeout"
export const STALE_FIX_TIMEOUT_TAG = "stale-fix-timeout"

function noChange(state: NavigationSessionState): NavigationSessionTransition {
  return { state, effects: [] }
}

function transition(
  state: NavigationSessionState,
  effects: readonly NavigationSessionEffect[] = []
): NavigationSessionTransition {
  return { state, effects }
}

function currentTimeMillis(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now()
}

function teardownEffects(
  state: NavigationSessionState,
  includeJournalHandoff: boolean
): NavigationSessionEffect[] {
  const effects: NavigationSessionEffect[] = [
    { kind: "GeolocationUnsubscribe" },
    { kind: "WakeLockRelease" },
    { kind: "ClearTimeout", tag: REROUTE_TIMEOUT_TAG },
    { kind: "ClearTimeout", tag: STALE_FIX_TIMEOUT_TAG },
    { kind: "RerouteCancel" }
  ]

  if (state.recording.active) {
    effects.push({ kind: "RecordingStop" })
  }

  if (includeJournalHandoff && state.journalHandoffPending) {
    effects.push({ kind: "JournalHandoff" })
  }

  return effects
}

export function navigationSessionReducer(
  state: NavigationSessionState,
  command: NavigationSessionCommand
): NavigationSessionTransition {
  switch (command.type) {
    case "start": {
      if (state.phase !== "idle" && state.phase !== "finished") return noChange(state)

      const nextState = command.recover
        ? pushCheckpoint({ ...clearError(state), phase: "acquiring", routeId: command.routeId }, command.recover)
        : { ...clearError(state), phase: "acquiring" as const, routeId: command.routeId }

      return transition(nextState, [
        { kind: "GeolocationSubscribe" },
        { kind: "WakeLockAcquire" }
      ])
    }

    case "acquireFix": {
      if (state.phase !== "acquiring" && state.phase !== "recovering") return noChange(state)
      return transition({ ...state, phase: "navigating" })
    }

    case "pause": {
      if (state.phase !== "navigating" && state.phase !== "rerouting") return noChange(state)

      const effects: NavigationSessionEffect[] = [
        { kind: "GeolocationUnsubscribe" },
        { kind: "WakeLockRelease" }
      ]

      if (state.phase === "rerouting") {
        effects.push({ kind: "RerouteCancel" }, { kind: "ClearTimeout", tag: REROUTE_TIMEOUT_TAG })
      }

      return transition({ ...state, phase: "paused", reroutePolicy: null }, effects)
    }

    case "resume": {
      if (state.phase !== "paused" && state.phase !== "recovering") return noChange(state)
      return transition({ ...state, phase: "navigating" }, [
        { kind: "GeolocationSubscribe" },
        { kind: "WakeLockAcquire" }
      ])
    }

    case "stop": {
      if (state.phase === "idle" || state.phase === "finished") return noChange(state)
      return transition(
        {
          ...state,
          phase: "finished",
          reroutePolicy: null,
          recording: { active: false, startedAt: null },
          journalHandoffPending: false
        },
        teardownEffects(state, true)
      )
    }

    case "cancel": {
      if (state.phase === "idle") return noChange(state)
      return transition(createNavigationSessionState(), teardownEffects(state, false))
    }

    case "requestReroute": {
      if (state.phase !== "navigating") return noChange(state)
      return transition(
        { ...state, phase: "rerouting", reroutePolicy: command.policy },
        [
          { kind: "RerouteRequest", policy: command.policy },
          { kind: "ScheduleTimeout", durationMillis: REROUTE_TIMEOUT_MILLIS, tag: REROUTE_TIMEOUT_TAG }
        ]
      )
    }

    case "cancelReroute": {
      if (state.phase !== "rerouting") return noChange(state)
      return transition(
        { ...state, phase: "navigating", reroutePolicy: null },
        [{ kind: "RerouteCancel" }, { kind: "ClearTimeout", tag: REROUTE_TIMEOUT_TAG }]
      )
    }

    case "recover": {
      if (!["navigating", "paused", "recovering", "rerouting"].includes(state.phase)) return noChange(state)

      const effects: NavigationSessionEffect[] = []
      if (state.phase === "paused") effects.push({ kind: "GeolocationSubscribe" })
      if (state.phase === "rerouting") {
        effects.push({ kind: "ClearTimeout", tag: REROUTE_TIMEOUT_TAG }, { kind: "RerouteCancel" })
      }

      return transition(
        pushCheckpoint(
          { ...state, phase: "recovering", reroutePolicy: command.policy },
          command.checkpoint
        ),
        effects
      )
    }

    case "beginRecording": {
      if (state.phase !== "navigating" || state.recording.active) return noChange(state)
      return transition(
        { ...state, recording: { active: true, startedAt: currentTimeMillis() } },
        [{ kind: "RecordingStart" }]
      )
    }

    case "finishRecording": {
      if (!state.recording.active) return noChange(state)
      return transition(
        { ...state, recording: { active: false, startedAt: null }, journalHandoffPending: true },
        [{ kind: "RecordingStop" }, { kind: "JournalHandoff" }]
      )
    }

    case "discardRecording": {
      if (!state.recording.active) return noChange(state)
      return transition(
        { ...state, recording: { active: false, startedAt: null } },
        [{ kind: "RecordingStop" }]
      )
    }

    case "reportError": {
      const erroredState = setError(state, command.error)
      if (command.error.kind === "denied") return transition({ ...erroredState, phase: "failed" })
      if (
        state.phase === "navigating"
        && (command.error.kind === "dropout" || command.error.kind === "stale")
      ) {
        return transition({ ...erroredState, phase: "recovering" })
      }

      return transition(erroredState)
    }

    case "clearError":
      return transition(clearError(state))

    case "setCapabilities":
      return transition(withCapabilities(state, command.capabilities))

    case "recordDeviation":
      return transition(pushDeviation(state, command.sample))

    case "recordCheckpoint":
      return transition(pushCheckpoint(state, command.checkpoint))

    case "markJournalHandoff":
      return transition({ ...state, journalHandoffPending: command.pending })

    case "reset":
      return transition(createNavigationSessionState(), teardownEffects(state, false))
  }
}
