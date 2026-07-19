const RECOVERY_KEY = "switchback-ride-recovery-v1"
const MAX_RECOVERY_AGE_MS = 24 * 60 * 60 * 1_000
const MAX_PAUSED_RECOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1_000
const MAX_DEVIATION_HISTORY = 20

export interface RideDeviationRecord {
  detectedAt: string
  coordinate: [number, number]
  distanceFromRouteMeters: number
}

export interface RideRecoveryCheckpoint {
  routeId: string
  nearestGeometryIndex: number
  percent: number
  savedAt: string
  completedWaypointIndexes?: number[]
  activeInstructionIndex?: number
  pausedAt?: string | null
  deviationHistory?: RideDeviationRecord[]
}

function normalizeDeviationHistory(history: unknown): RideDeviationRecord[] {
  if (!Array.isArray(history)) return []
  return history.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as Partial<RideDeviationRecord>
    const distanceFromRouteMeters = record.distanceFromRouteMeters
    if (!record.detectedAt || !Number.isFinite(Date.parse(record.detectedAt)) ||
        !Array.isArray(record.coordinate) || record.coordinate.length !== 2 ||
        !record.coordinate.every(Number.isFinite) ||
        typeof distanceFromRouteMeters !== "number" ||
        !Number.isFinite(distanceFromRouteMeters) || distanceFromRouteMeters < 0) return []
    return [{
      detectedAt: record.detectedAt,
      coordinate: [record.coordinate[0]!, record.coordinate[1]!] as [number, number],
      distanceFromRouteMeters
    }]
  }).slice(-MAX_DEVIATION_HISTORY)
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function saveRideRecovery(checkpoint: RideRecoveryCheckpoint): void {
  const target = storage()
  if (!target || !checkpoint.routeId || !Number.isInteger(checkpoint.nearestGeometryIndex)) return
  try {
    target.setItem(RECOVERY_KEY, JSON.stringify({
      ...checkpoint,
      percent: Math.max(0, Math.min(100, checkpoint.percent)),
      ...(checkpoint.completedWaypointIndexes ? {
        completedWaypointIndexes: [...new Set(checkpoint.completedWaypointIndexes
          .filter((index) => Number.isInteger(index) && index >= 0))]
      } : {}),
      ...(Number.isInteger(checkpoint.activeInstructionIndex) && checkpoint.activeInstructionIndex! >= 0
        ? { activeInstructionIndex: checkpoint.activeInstructionIndex }
        : {}),
      ...(checkpoint.pausedAt && Number.isFinite(Date.parse(checkpoint.pausedAt))
        ? { pausedAt: checkpoint.pausedAt }
        : {}),
      ...(checkpoint.deviationHistory ? { deviationHistory: normalizeDeviationHistory(checkpoint.deviationHistory) } : {})
    }))
  } catch {
    // Local storage can be unavailable in private browser modes. Guidance
    // remains usable; it simply cannot survive a reload on that device.
  }
}

export function loadRideRecovery(routeId: string, now = new Date()): RideRecoveryCheckpoint | null {
  const target = storage()
  if (!target) return null
  try {
    const parsed = JSON.parse(target.getItem(RECOVERY_KEY) ?? "null") as RideRecoveryCheckpoint | null
    if (!parsed || parsed.routeId !== routeId || !Number.isInteger(parsed.nearestGeometryIndex)) return null
    const age = now.getTime() - Date.parse(parsed.savedAt)
    const pausedAt = parsed.pausedAt && Number.isFinite(Date.parse(parsed.pausedAt))
      ? parsed.pausedAt
      : null
    const maximumAge = pausedAt ? MAX_PAUSED_RECOVERY_AGE_MS : MAX_RECOVERY_AGE_MS
    if (!Number.isFinite(age) || age < -60_000 || age > maximumAge) {
      target.removeItem(RECOVERY_KEY)
      return null
    }
    return {
      ...parsed,
      ...(Array.isArray(parsed.completedWaypointIndexes) ? {
        completedWaypointIndexes: [...new Set(parsed.completedWaypointIndexes
          .filter((index) => Number.isInteger(index) && index >= 0))]
      } : {}),
      ...(Number.isInteger(parsed.activeInstructionIndex) && parsed.activeInstructionIndex! >= 0
        ? { activeInstructionIndex: parsed.activeInstructionIndex }
        : {}),
      ...(pausedAt
        ? { pausedAt }
        : {}),
      ...(parsed.deviationHistory ? { deviationHistory: normalizeDeviationHistory(parsed.deviationHistory) } : {})
    }
  } catch {
    return null
  }
}

export function clearRideRecovery(): void {
  try {
    storage()?.removeItem(RECOVERY_KEY)
  } catch {
    // no-op
  }
}
