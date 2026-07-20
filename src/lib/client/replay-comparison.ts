import type { Coordinate, PlannedRoute } from "@/lib/routing/types"
import type { RecordedRide, RecordedRidePoint } from "@/lib/storage/ride-journal"
import { coordinateDistanceMeters } from "@/lib/client/navigation-engine"

export const REPLAY_CONTRACT_VERSION = 1 as const

export type ReplaySegmentStatus = "on-track" | "deviating" | "gap"

export interface PlannedSegmentMatch {
  status: ReplaySegmentStatus
  plannedStartIndex: number
  plannedEndIndex: number
  actualStartIndex: number
  actualEndIndex: number
  averageOffsetMeters: number
  maxOffsetMeters: number
}

export interface ReplayComparisonResult {
  contractVersion: typeof REPLAY_CONTRACT_VERSION
  plannedRouteId: string
  rideId: string
  plannedDistanceMiles: number
  recordedDistanceMiles: number
  plannedDurationMinutes: number
  recordedDurationMinutes: number
  onTrackPercent: number
  averageOffsetMeters: number
  maxOffsetMeters: number
  segments: PlannedSegmentMatch[]
  privacyNote: string
}

export interface ReplayComparisonConfig {
  maxOffsetToleranceMeters: number
  minActualPointsForMatch: number
  gapToleranceSeconds: number
}

export const DEFAULT_REPLAY_CONFIG: ReplayComparisonConfig = {
  maxOffsetToleranceMeters: 100,
  minActualPointsForMatch: 4,
  gapToleranceSeconds: 120
}

function findNearestPlannedIndex(
  coordinate: Coordinate,
  plannedGeometry: Coordinate[],
  previousIndex: number
): { index: number; offsetMeters: number } {
  const searchWindow = 30
  const start = Math.max(0, previousIndex - searchWindow)
  const end = Math.min(plannedGeometry.length - 1, previousIndex + searchWindow)
  let bestIndex = previousIndex
  let bestOffset = Infinity

  for (let i = start; i <= end; i += 1) {
    const offset = coordinateDistanceMeters(coordinate, plannedGeometry[i]!)
    if (offset < bestOffset) {
      bestOffset = offset
      bestIndex = i
    }
  }

  return { index: bestIndex, offsetMeters: bestOffset }
}

function recordedDistance(actualPoints: RecordedRidePoint[]): number {
  let total = 0
  for (let i = 1; i < actualPoints.length; i += 1) {
    total += coordinateDistanceMeters(
      actualPoints[i - 1]!.coordinate,
      actualPoints[i]!.coordinate
    )
  }
  return total
}

export function buildReplaySegments(
  plannedGeometry: Coordinate[],
  actualPoints: RecordedRidePoint[],
  config: ReplayComparisonConfig
): PlannedSegmentMatch[] {
  if (plannedGeometry.length < 2 || actualPoints.length < config.minActualPointsForMatch) {
    return []
  }

  const segments: PlannedSegmentMatch[] = []
  let currentSegment: {
    status: ReplaySegmentStatus
    plannedStartIndex: number
    actualStartIndex: number
    offsets: number[]
    started: boolean
  } | null = null

  let previousPlannedIndex = 0

  for (let i = 0; i < actualPoints.length; i += 1) {
    const point = actualPoints[i]!
    const { index: plannedIndex, offsetMeters } = findNearestPlannedIndex(
      point.coordinate,
      plannedGeometry,
      previousPlannedIndex
    )

    const isGap =
      i > 0 &&
      Date.parse(point.recordedAt) -
        Date.parse(actualPoints[i - 1]!.recordedAt) >
        config.gapToleranceSeconds * 1000

    if (isGap) {
      if (currentSegment) {
        segments.push({
          status: currentSegment.status,
          plannedStartIndex: currentSegment.plannedStartIndex,
          plannedEndIndex: previousPlannedIndex,
          actualStartIndex: currentSegment.actualStartIndex,
          actualEndIndex: i - 1,
          averageOffsetMeters:
            currentSegment.offsets.reduce((a, b) => a + b, 0) /
            currentSegment.offsets.length,
          maxOffsetMeters: Math.max(...currentSegment.offsets)
        })
        currentSegment = null
      }
      segments.push({
        status: "gap",
        plannedStartIndex: previousPlannedIndex,
        plannedEndIndex: plannedIndex,
        actualStartIndex: i - 1,
        actualEndIndex: i,
        averageOffsetMeters: 0,
        maxOffsetMeters: 0
      })
      previousPlannedIndex = plannedIndex
      continue
    }

    if (currentSegment === null) {
      currentSegment = {
        status: offsetMeters <= config.maxOffsetToleranceMeters ? "on-track" : "deviating",
        plannedStartIndex: plannedIndex,
        actualStartIndex: i,
        offsets: [offsetMeters],
        started: true
      }
    } else {
      currentSegment.offsets.push(offsetMeters)
      const newStatus =
        offsetMeters <= config.maxOffsetToleranceMeters ? "on-track" : "deviating"
      if (newStatus !== currentSegment.status && currentSegment.offsets.length >= config.minActualPointsForMatch) {
        segments.push({
          status: currentSegment.status,
          plannedStartIndex: currentSegment.plannedStartIndex,
          plannedEndIndex: previousPlannedIndex,
          actualStartIndex: currentSegment.actualStartIndex,
          actualEndIndex: i - 1,
          averageOffsetMeters:
            currentSegment.offsets.reduce((a, b) => a + b, 0) /
            currentSegment.offsets.length,
          maxOffsetMeters: Math.max(...currentSegment.offsets)
        })
        currentSegment = {
          status: newStatus,
          plannedStartIndex: plannedIndex,
          actualStartIndex: i,
          offsets: [offsetMeters],
          started: true
        }
      }

      if (currentSegment && newStatus !== currentSegment.status) {
        currentSegment.status = newStatus
      }
    }

    previousPlannedIndex = plannedIndex
  }

  if (currentSegment) {
    segments.push({
      status: currentSegment.status,
      plannedStartIndex: currentSegment.plannedStartIndex,
      plannedEndIndex: previousPlannedIndex,
      actualStartIndex: currentSegment.actualStartIndex,
      actualEndIndex: actualPoints.length - 1,
      averageOffsetMeters:
        currentSegment.offsets.reduce((a, b) => a + b, 0) /
        currentSegment.offsets.length,
      maxOffsetMeters: Math.max(...currentSegment.offsets)
    })
  }

  return segments.filter(
    (segment) =>
      segment.actualEndIndex - segment.actualStartIndex >=
        config.minActualPointsForMatch - 1 ||
      segment.status === "gap"
  )
}

export function comparePlannedVsActual(
  plannedRoute: PlannedRoute,
  recordedRide: RecordedRide,
  config: ReplayComparisonConfig = DEFAULT_REPLAY_CONFIG
): ReplayComparisonResult {
  const segments = buildReplaySegments(
    plannedRoute.geometry,
    recordedRide.points,
    config
  )

  const onTrackSegments = segments.filter((s) => s.status === "on-track")
  const onTrackPointCount = onTrackSegments.reduce(
    (sum, s) => sum + (s.actualEndIndex - s.actualStartIndex + 1),
    0
  )
  const totalMatched = segments
    .filter((s) => s.status !== "gap")
    .reduce((sum, s) => sum + (s.actualEndIndex - s.actualStartIndex + 1), 0)
  const onTrackPercent = totalMatched > 0 ? (onTrackPointCount / totalMatched) * 100 : 0

  const allOffsets = segments
    .filter((s) => s.status !== "gap")
    .flatMap((s) => [s.averageOffsetMeters])
  const averageOffsetMeters =
    allOffsets.length > 0
      ? allOffsets.reduce((a, b) => a + b, 0) / allOffsets.length
      : 0
  const maxOffsetMeters = allOffsets.length > 0 ? Math.max(...allOffsets) : 0

  const recordedDist = recordedDistance(recordedRide.points)
  const started = Date.parse(recordedRide.startedAt)
  const ended = Date.parse(recordedRide.endedAt)
  const actualDurationMinutes =
    Number.isFinite(started) && Number.isFinite(ended)
      ? Math.round((ended - started) / 60_000)
      : 0

  return {
    contractVersion: REPLAY_CONTRACT_VERSION,
    plannedRouteId: plannedRoute.id,
    rideId: recordedRide.id,
    plannedDistanceMiles: plannedRoute.distanceMiles,
    recordedDistanceMiles: Number((recordedDist / 1609.344).toFixed(2)),
    plannedDurationMinutes: plannedRoute.durationMinutes,
    recordedDurationMinutes: actualDurationMinutes,
    onTrackPercent: Math.round(onTrackPercent * 10) / 10,
    averageOffsetMeters: Math.round(averageOffsetMeters * 10) / 10,
    maxOffsetMeters: Math.round(maxOffsetMeters),
    segments,
    privacyNote:
      "Replay comparison geometry is stored only on this device. No trace data is shared outside your browser."
  }
}

export function replayPercentOnTrack(
  result: ReplayComparisonResult
): number {
  return result.onTrackPercent
}

export function replayDeviationSegments(
  result: ReplayComparisonResult
): PlannedSegmentMatch[] {
  return result.segments.filter((s) => s.status === "deviating")
}

export function replayGapSegments(
  result: ReplayComparisonResult
): PlannedSegmentMatch[] {
  return result.segments.filter((s) => s.status === "gap")
}
