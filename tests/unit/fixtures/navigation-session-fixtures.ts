import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type {
  NavigationDeviationSample,
  NavigationRecoveryCheckpoint,
  NavigationSessionState
} from "@/lib/client/navigation-session"
import { createNavigationSessionState } from "@/lib/client/navigation-session"

export const idleState = createNavigationSessionState()

export const navigatingState: NavigationSessionState = {
  ...createNavigationSessionState(),
  phase: "navigating",
  capabilities: { hasGeolocation: true, hasWakeLock: true, hasVoice: true, hasBackground: true },
  routeId: "test-route"
}

export const sampleFrame: NavigationFrame = {
  status: "navigating",
  rawCoordinate: [-76.8867, 40.2732],
  matchedCoordinate: [-76.8867, 40.2732],
  accuracyMeters: 8,
  headingDegrees: 90,
  speedMetersPerSecond: 18,
  timestamp: 1_700_000_000_000,
  segmentIndex: 0,
  segmentFraction: 0.25,
  matchedDistanceMeters: 1_000,
  distanceFromRouteMeters: 4,
  routePercent: 25,
  remainingDistanceMeters: 3_000,
  remainingDurationSeconds: 180,
  instructionIndex: 0,
  instruction: null,
  thenInstruction: null,
  distanceToInstructionMeters: 500,
  offRouteFixCount: 0,
  offRouteSince: null,
  matchAmbiguous: false
}

export function deviationSample(at: number, offRouteMeters: number): NavigationDeviationSample {
  return { at, routeDistanceMeters: 1_000, offRouteMeters }
}

export function checkpoint(id: string): NavigationRecoveryCheckpoint {
  return { id, at: 1_700_000_000_000, coordinate: [-76.8867, 40.2732], routeIndex: 0, reason: "user" }
}
