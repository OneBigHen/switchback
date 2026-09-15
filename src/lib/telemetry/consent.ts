import { TELEMETRY_ACKNOWLEDGEMENT_VERSION } from "./config"

export const TELEMETRY_ACKNOWLEDGEMENT_STORAGE_KEY = "opengravel:telemetry-acknowledgement"

export type TelemetryAcknowledgementDecision = "accepted" | "declined"

export interface TelemetryAcknowledgement {
  version: string
  decision: TelemetryAcknowledgementDecision
  acknowledgedAt: string
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

function isAcknowledgement(value: unknown): value is TelemetryAcknowledgement {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<TelemetryAcknowledgement>
  return typeof candidate.version === "string"
    && (candidate.decision === "accepted" || candidate.decision === "declined")
    && typeof candidate.acknowledgedAt === "string"
    && candidate.acknowledgedAt.length > 0
}

export function readTelemetryAcknowledgement(storage: StorageLike | null | undefined): TelemetryAcknowledgement | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(TELEMETRY_ACKNOWLEDGEMENT_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isAcknowledgement(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeTelemetryAcknowledgement(
  storage: StorageLike | null | undefined,
  decision: TelemetryAcknowledgementDecision,
  acknowledgedAt = new Date().toISOString()
): TelemetryAcknowledgement {
  const acknowledgement: TelemetryAcknowledgement = {
    version: TELEMETRY_ACKNOWLEDGEMENT_VERSION,
    decision,
    acknowledgedAt
  }
  try {
    storage?.setItem(TELEMETRY_ACKNOWLEDGEMENT_STORAGE_KEY, JSON.stringify(acknowledgement))
  } catch {
    // Private browsing and storage quotas must never prevent the app from
    // continuing. Without persistence, the gate will reappear next visit.
  }
  return acknowledgement
}

export function hasCurrentTelemetryAcknowledgement(
  storage: StorageLike | null | undefined
): boolean {
  const acknowledgement = readTelemetryAcknowledgement(storage)
  return acknowledgement?.version === TELEMETRY_ACKNOWLEDGEMENT_VERSION
    && acknowledgement.decision === "accepted"
}
