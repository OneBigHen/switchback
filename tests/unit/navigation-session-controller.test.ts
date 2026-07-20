import { describe, expect, it } from "vitest"
import {
  createNavigationSessionState,
  navigationSessionReducer,
  selectReroutePolicy,
  selectViewModel,
  isCapabilityDegraded
} from "@/lib/client/navigation-session"
import type { NavigationSessionState } from "@/lib/client/navigation-session"
import {
  checkpoint,
  deviationSample,
  idleState,
  navigatingState,
  sampleFrame
} from "./fixtures/navigation-session-fixtures"

describe("navigation session controller", () => {
  it("createNavigationSessionState returns idle phase, no capabilities, no error", () => {
    const state = createNavigationSessionState()

    expect(state.phase).toBe("idle")
    expect(state.capabilities).toEqual({
      hasGeolocation: false,
      hasWakeLock: false,
      hasVoice: false,
      hasBackground: false
    })
    expect(state.lastError).toBeNull()
  })

  it("start from idle transitions to acquiring and emits geolocation and wake lock effects", () => {
    const transition = navigationSessionReducer(idleState, { type: "start", routeId: "route-a" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.phase).toBe("acquiring")
    expect(transition.state.routeId).toBe("route-a")
    expect(kinds).toContain("GeolocationSubscribe")
    expect(kinds).toContain("WakeLockAcquire")
  })

  it("start from finished transitions to acquiring", () => {
    const finishedState: NavigationSessionState = { ...idleState, phase: "finished" }
    const transition = navigationSessionReducer(finishedState, { type: "start", routeId: "route-b" })

    expect(transition.state.phase).toBe("acquiring")
    expect(transition.state.routeId).toBe("route-b")
  })

  it("start from navigating is illegal and returns no change", () => {
    const transition = navigationSessionReducer(navigatingState, { type: "start", routeId: "route-c" })

    expect(transition.state).toBe(navigatingState)
    expect(transition.effects).toHaveLength(0)
  })

  it("acquireFix in acquiring transitions to navigating", () => {
    const acquiringState: NavigationSessionState = { ...idleState, phase: "acquiring", routeId: "route-a" }
    const transition = navigationSessionReducer(acquiringState, { type: "acquireFix" })

    expect(transition.state.phase).toBe("navigating")
  })

  it("pause in navigating transitions to paused and emits teardown effects", () => {
    const transition = navigationSessionReducer(navigatingState, { type: "pause" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.phase).toBe("paused")
    expect(kinds).toContain("GeolocationUnsubscribe")
    expect(kinds).toContain("WakeLockRelease")
  })

  it("resume in paused transitions to navigating and emits subscribe effects", () => {
    const pausedState: NavigationSessionState = { ...navigatingState, phase: "paused" }
    const transition = navigationSessionReducer(pausedState, { type: "resume" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.phase).toBe("navigating")
    expect(kinds).toContain("GeolocationSubscribe")
    expect(kinds).toContain("WakeLockAcquire")
  })

  it("requestReroute in navigating transitions to rerouting and emits reroute effects", () => {
    const transition = navigationSessionReducer(navigatingState, {
      type: "requestReroute",
      policy: "nearest-safe"
    })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.phase).toBe("rerouting")
    expect(transition.state.reroutePolicy).toBe("nearest-safe")
    expect(kinds).toContain("RerouteRequest")
    expect(kinds).toContain("ScheduleTimeout")
  })

  it("cancelReroute in rerouting transitions to navigating and clears reroute effects", () => {
    const reroutingState: NavigationSessionState = {
      ...navigatingState,
      phase: "rerouting",
      reroutePolicy: "nearest-safe"
    }
    const transition = navigationSessionReducer(reroutingState, { type: "cancelReroute" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.phase).toBe("navigating")
    expect(transition.state.reroutePolicy).toBeNull()
    expect(kinds).toContain("RerouteCancel")
    expect(kinds).toContain("ClearTimeout")
  })

  it("requestReroute in idle is illegal and returns no change", () => {
    const transition = navigationSessionReducer(idleState, {
      type: "requestReroute",
      policy: "nearest-safe"
    })

    expect(transition.state).toBe(idleState)
    expect(transition.effects).toHaveLength(0)
  })

  it("recover in navigating with checkpoint transitions to recovering", () => {
    const recoveryCheckpoint = checkpoint("recover-a")
    const transition = navigationSessionReducer(navigatingState, {
      type: "recover",
      policy: "next-shaping-point",
      checkpoint: recoveryCheckpoint
    })

    expect(transition.state.phase).toBe("recovering")
    expect(transition.state.recoveryCheckpoints).toContain(recoveryCheckpoint)
  })

  it("beginRecording in navigating activates recording and emits RecordingStart", () => {
    const transition = navigationSessionReducer(navigatingState, { type: "beginRecording" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.recording.active).toBe(true)
    expect(transition.state.recording.startedAt).toEqual(expect.any(Number))
    expect(kinds).toContain("RecordingStart")
  })

  it("finishRecording when recording stops recording, emits handoff, and marks pending", () => {
    const recordingState: NavigationSessionState = {
      ...navigatingState,
      recording: { active: true, startedAt: 123 }
    }
    const transition = navigationSessionReducer(recordingState, { type: "finishRecording" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.recording.active).toBe(false)
    expect(transition.state.journalHandoffPending).toBe(true)
    expect(kinds).toContain("RecordingStop")
    expect(kinds).toContain("JournalHandoff")
  })

  it("discardRecording when recording stops recording without journal handoff", () => {
    const recordingState: NavigationSessionState = {
      ...navigatingState,
      recording: { active: true, startedAt: 123 }
    }
    const transition = navigationSessionReducer(recordingState, { type: "discardRecording" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.recording.active).toBe(false)
    expect(kinds).toContain("RecordingStop")
    expect(kinds).not.toContain("JournalHandoff")
  })

  it("reportError denied in navigating transitions to failed", () => {
    const transition = navigationSessionReducer(navigatingState, {
      type: "reportError",
      error: { kind: "denied" }
    })

    expect(transition.state.phase).toBe("failed")
  })

  it("reportError dropout in navigating transitions to recovering and stores the error", () => {
    const transition = navigationSessionReducer(navigatingState, {
      type: "reportError",
      error: { kind: "dropout" }
    })

    expect(transition.state.phase).toBe("recovering")
    expect(transition.state.lastError).toEqual({ kind: "dropout" })
  })

  it("clearError clears the error without changing phase", () => {
    const erroredState: NavigationSessionState = {
      ...navigatingState,
      lastError: { kind: "unknown", message: "test" }
    }
    const transition = navigationSessionReducer(erroredState, { type: "clearError" })

    expect(transition.state.phase).toBe("navigating")
    expect(transition.state.lastError).toBeNull()
  })

  it("setCapabilities merges partial capabilities and preserves missing capabilities", () => {
    const transition = navigationSessionReducer(navigatingState, {
      type: "setCapabilities",
      capabilities: { hasVoice: false }
    })

    expect(transition.state.capabilities).toEqual({
      hasGeolocation: true,
      hasWakeLock: true,
      hasVoice: false,
      hasBackground: true
    })
  })

  it("recordDeviation pushes samples and caps history at 16", () => {
    let state = navigatingState

    for (let index = 0; index < 20; index += 1) {
      state = navigationSessionReducer(state, {
        type: "recordDeviation",
        sample: deviationSample(index, 40)
      }).state
    }

    expect(state.deviationHistory).toHaveLength(16)
  })

  it("recordCheckpoint pushes checkpoints", () => {
    const recoveryCheckpoint = checkpoint("checkpoint-a")
    const transition = navigationSessionReducer(navigatingState, {
      type: "recordCheckpoint",
      checkpoint: recoveryCheckpoint
    })

    expect(transition.state.recoveryCheckpoints).toContain(recoveryCheckpoint)
  })

  it("stop from navigating finishes and emits teardown without recording or handoff", () => {
    const transition = navigationSessionReducer(navigatingState, { type: "stop" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.phase).toBe("finished")
    expect(kinds).toContain("GeolocationUnsubscribe")
    expect(kinds).toContain("WakeLockRelease")
    expect(kinds).not.toContain("RecordingStop")
    expect(kinds).not.toContain("JournalHandoff")
  })

  it("stop while recording also emits RecordingStop", () => {
    const recordingState: NavigationSessionState = {
      ...navigatingState,
      recording: { active: true, startedAt: 123 }
    }
    const transition = navigationSessionReducer(recordingState, { type: "stop" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.phase).toBe("finished")
    expect(kinds).toContain("RecordingStop")
  })

  it("cancel returns to idle and tears down without journal handoff", () => {
    const markedState = navigationSessionReducer(navigatingState, {
      type: "markJournalHandoff",
      pending: true
    }).state
    const transition = navigationSessionReducer(markedState, { type: "cancel" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.phase).toBe("idle")
    expect(transition.state.journalHandoffPending).toBe(false)
    expect(kinds).not.toContain("JournalHandoff")
  })

  it("reset returns to idle and emits full teardown", () => {
    const activeState: NavigationSessionState = {
      ...navigatingState,
      phase: "rerouting",
      reroutePolicy: "nearest-safe",
      recording: { active: true, startedAt: 123 }
    }
    const transition = navigationSessionReducer(activeState, { type: "reset" })
    const kinds = transition.effects.map((effect) => effect.kind)

    expect(transition.state.phase).toBe("idle")
    expect(kinds).toContain("GeolocationUnsubscribe")
    expect(kinds).toContain("WakeLockRelease")
    expect(kinds).toContain("RerouteCancel")
    expect(kinds.filter((kind) => kind === "ClearTimeout")).toHaveLength(2)
  })

  it("selectors expose view model, capability degradation, and reroute policy", () => {
    const reroutingState: NavigationSessionState = {
      ...navigatingState,
      phase: "rerouting",
      reroutePolicy: "fuel-detour",
      capabilities: { ...navigatingState.capabilities, hasVoice: false }
    }
    const viewModel = selectViewModel(reroutingState, null)

    expect(viewModel.frame).toBeNull()
    expect(isCapabilityDegraded(reroutingState)).toBe(true)
    expect(selectReroutePolicy(reroutingState)).toBe("fuel-detour")
    expect(selectReroutePolicy(navigatingState)).toBeNull()
  })

  it("selectViewModel is referentially stable for unchanged refs", () => {
    const first = selectViewModel(navigatingState, sampleFrame)
    const second = selectViewModel(navigatingState, sampleFrame)

    expect(second).toBe(first)
  })
})
