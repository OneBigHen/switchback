import type { Coordinate } from "@/lib/routing/types"
import type { NavigationFrame } from "@/lib/client/navigation-engine"

export type NavigationReroutePolicy =
  | "nearest-safe"
  | "next-shaping-point"
  | "skip-point"
  | "preserve-original"
  | "fuel-detour"

export type NavigationSessionPhase =
  | "idle" | "acquiring" | "navigating" | "paused"
  | "recovering" | "rerouting" | "finished" | "failed"

export interface NavigationCapabilityFlags {
  readonly hasGeolocation: boolean
  readonly hasWakeLock: boolean
  readonly hasVoice: boolean
  readonly hasBackground: boolean
}

export interface NavigationDeviationSample {
  readonly at: number
  readonly routeDistanceMeters: number
  readonly offRouteMeters: number
}

export interface NavigationRecoveryCheckpoint {
  readonly id: string
  readonly at: number
  readonly coordinate: Coordinate
  readonly routeIndex: number
  readonly reason: "user" | "system" | "reroute"
}

export type NavigationSessionError =
  | { kind: "denied" }
  | { kind: "stale" }
  | { kind: "dropout" }
  | { kind: "reroute-failed" }
  | { kind: "recording-failed" }
  | { kind: "unknown"; message: string }

export interface NavigationSessionState {
  readonly phase: NavigationSessionPhase
  readonly capabilities: NavigationCapabilityFlags
  readonly routeId: string | null
  readonly deviationHistory: readonly NavigationDeviationSample[]
  readonly recoveryCheckpoints: readonly NavigationRecoveryCheckpoint[]
  readonly reroutePolicy: NavigationReroutePolicy | null
  readonly recording: { readonly active: boolean; readonly startedAt: number | null }
  readonly journalHandoffPending: boolean
  readonly lastError: NavigationSessionError | null
}

export type NavigationSessionCommand =
  | { type: "start"; routeId: string; recover?: NavigationRecoveryCheckpoint }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "cancel" }
  | { type: "acquireFix" }
  | { type: "requestReroute"; policy: NavigationReroutePolicy }
  | { type: "cancelReroute" }
  | { type: "recover"; policy: NavigationReroutePolicy; checkpoint: NavigationRecoveryCheckpoint }
  | { type: "beginRecording" }
  | { type: "finishRecording" }
  | { type: "discardRecording" }
  | { type: "reportError"; error: NavigationSessionError }
  | { type: "clearError" }
  | { type: "setCapabilities"; capabilities: Partial<NavigationCapabilityFlags> }
  | { type: "recordDeviation"; sample: NavigationDeviationSample }
  | { type: "recordCheckpoint"; checkpoint: NavigationRecoveryCheckpoint }
  | { type: "markJournalHandoff"; pending: boolean }
  | { type: "reset" }

export type NavigationSessionEffect =
  | { kind: "GeolocationSubscribe" }
  | { kind: "GeolocationUnsubscribe" }
  | { kind: "WakeLockAcquire" }
  | { kind: "WakeLockRelease" }
  | { kind: "VoiceSpeak" }
  | { kind: "RecordingStart" }
  | { kind: "RecordingStop" }
  | { kind: "JournalHandoff" }
  | { kind: "RerouteRequest"; policy: NavigationReroutePolicy }
  | { kind: "RerouteCancel" }
  | { kind: "ScheduleTimeout"; durationMillis: number; tag: string }
  | { kind: "ClearTimeout"; tag: string }

export interface NavigationSessionTransition {
  readonly state: NavigationSessionState
  readonly effects: readonly NavigationSessionEffect[]
}

export interface NavigationSessionViewModel {
  readonly phase: NavigationSessionPhase
  readonly routeId: string | null
  readonly capabilities: NavigationCapabilityFlags
  readonly isCapabilityDegraded: boolean
  readonly canPause: boolean
  readonly canResume: boolean
  readonly canCancelReroute: boolean
  readonly canRecover: boolean
  readonly canBeginRecording: boolean
  readonly canFinishRecording: boolean
  readonly recordingActive: boolean
  readonly recordingStartedAt: number | null
  readonly reroutePolicy: NavigationReroutePolicy | null
  readonly journalHandoffPending: boolean
  readonly lastError: NavigationSessionError | null
  readonly deviationCount: number
  readonly lastDeviation: NavigationDeviationSample | null
  readonly checkpointCount: number
  readonly latestCheckpoint: NavigationRecoveryCheckpoint | null
  readonly frame: NavigationFrame | null
}
