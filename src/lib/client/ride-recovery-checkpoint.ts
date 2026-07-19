import type { NavigationFrame } from "@/lib/client/navigation-engine"
import type { PlannedRoute } from "@/lib/routing/types"
import type { RideDeviationRecord, RideRecoveryCheckpoint } from "@/lib/storage/ride-recovery"

interface BuildRideRecoveryCheckpointInput {
  route: PlannedRoute
  frame: NavigationFrame
  completedWaypointIndexes: number[]
  deviationHistory: RideDeviationRecord[]
  savedAt: string
  paused?: boolean
}

export function buildRideRecoveryCheckpoint({
  route,
  frame,
  completedWaypointIndexes,
  deviationHistory,
  savedAt,
  paused = false
}: BuildRideRecoveryCheckpointInput): RideRecoveryCheckpoint {
  return {
    routeId: route.id,
    nearestGeometryIndex: Math.min(
      route.geometry.length - 1,
      frame.segmentIndex + (frame.segmentFraction >= 0.5 ? 1 : 0)
    ),
    percent: frame.routePercent,
    savedAt,
    completedWaypointIndexes,
    activeInstructionIndex: frame.instructionIndex,
    deviationHistory,
    ...(paused ? { pausedAt: savedAt } : {})
  }
}
